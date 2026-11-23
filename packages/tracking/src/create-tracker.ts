import {
  buildCustomEvent,
  buildPageView,
  type BuildResult,
  type EventSource,
} from "./build-event.ts";
import { createConsentController } from "./consent-controller.ts";
import { CONSENT_CHANGED, isConsentNotice } from "./cross-tab.ts";
import { createDelivery } from "./delivery.ts";
import { dropReason, type DropReason } from "./drop-reason.ts";
import { minimisePath } from "./minimise-url.ts";
import { resolveOptions } from "./resolve-options.ts";
import { createSessionStore } from "./session-store.ts";
import { removeItemIfPresent } from "./storage.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";
import type { ConsentStatus, Tracker, TrackerOptions } from "./tracker-types.ts";
import { IDENTIFIER_PATTERN } from "./wire-format.ts";

/**
 * Creates a tracker. Consent comes first: until the visitor grants it (and no browser signal says
 * otherwise) nothing is sent, queued, or written to any storage but the consent record itself.
 * Throws a `TypeError` for an invalid option; after that no method ever throws.
 */
export const createTracker = (trackerOptions: TrackerOptions): Tracker => {
  const options = resolveOptions(trackerOptions);
  const { page, localStorage, crossTab } = options;

  const controller = createConsentController({
    storage: localStorage,
    version: options.consentVersion,
    now: options.clock.now,
    signals: page.signals,
  });
  const sessions = createSessionStore({
    storage: options.sessionStorage,
    clock: options.clock,
    crypto: options.crypto,
    timeout: options.sessionTimeout,
  });

  let status: ConsentStatus = controller.read();
  let disposed = false;
  let userId: string | undefined;
  let documentReferrerPending = true;
  let lastAutoPath: string | undefined;
  const listeners = new Set<(status: ConsentStatus) => void>();

  const report = (reason: DropReason): void => {
    try {
      options.onDrop(reason);
    } catch {
      // A page's reporter must never break the page.
    }
  };

  const delivery = createDelivery({ options, allowed: () => granted(), report });

  const notify = (next: ConsentStatus): void => {
    for (const listener of [...listeners]) {
      try {
        listener(next);
      } catch {
        // One listener's failure is not another's.
      }
    }
  };

  // What revoking consent undoes: the queue, its stored copy, the session and the identified user.
  const discard = (): void => {
    delivery.revoke();
    sessions.clear();
    userId = undefined;
    lastAutoPath = undefined;
    removeItemIfPresent(localStorage, STORAGE_KEYS.queue);
  };

  // Reads consent afresh, so a change made in another tab, or a browser signal that appeared,
  // takes effect at the next use even when no notice reached this tab.
  const refresh = (): ConsentStatus => {
    if (disposed) return status;
    const next = controller.read();
    const previous = status;
    status = next;
    if (previous.state === "granted" && next.state !== "granted") discard();
    if (previous.state !== next.state || previous.reason !== next.reason) notify(next);
    return next;
  };

  function granted(): boolean {
    return !disposed && refresh().state === "granted";
  }

  const announce = (): void => {
    try {
      crossTab?.post({ type: CONSENT_CHANGED });
    } catch {
      // Other tabs still learn at their next use.
    }
  };

  const source: EventSource = {
    options,
    session: () => sessions.current(),
    user: () => userId,
  };

  const record = (built: BuildResult): void => {
    for (const drop of built.drops) report(drop);
    if (built.event !== undefined) delivery.enqueue(built.event);
  };

  const recordPageView = (overrides: unknown): void => {
    const first = documentReferrerPending;
    documentReferrerPending = false;
    record(buildPageView(source, overrides, first));
  };

  const automaticPageView = (): void => {
    if (!options.autoPageViews || !granted()) return;
    const href = page.location();
    const path =
      href === undefined
        ? undefined
        : minimisePath(href, undefined, {
            allowedQueryParameters: options.allowedQueryParameters,
            maxValueLength: options.maxStringLength,
          });
    if (path === undefined || path === lastAutoPath) return;
    lastAutoPath = path;
    recordPageView(undefined);
  };

  const unsubscribers = [
    page.onHidden(() => {
      delivery.flushOnHide();
    }),
    page.onOnline(() => {
      delivery.resume();
    }),
    ...(options.autoPageViews ? [page.onNavigate(automaticPageView)] : []),
    ...(crossTab === undefined
      ? []
      : [
          crossTab.subscribe((message) => {
            if (isConsentNotice(message)) refresh();
          }),
        ]),
  ];

  if (status.state === "granted") {
    delivery.loadStored();
    automaticPageView();
  } else {
    // Whatever an earlier consent left behind is not ours to keep.
    discard();
  }

  const decide = (write: () => boolean, revoking: boolean): boolean => {
    if (disposed) return false;
    const before = status.state;
    const stored = write();
    if (revoking) discard();
    const next = refresh();
    if (stored) announce();
    if (before !== "granted" && next.state === "granted") {
      delivery.loadStored();
      automaticPageView();
    }
    return stored;
  };

  return {
    consent: {
      get: () => (disposed ? status : refresh()),
      grant: () => decide(controller.grant, false),
      deny: () => decide(controller.deny, true),
      reset: () => decide(controller.reset, true),
      onChange: (listener) => {
        if (disposed) return () => undefined;
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    track: (name, properties) => {
      if (!granted()) return;
      record(buildCustomEvent(source, name, properties));
    },
    page: (overrides) => {
      if (!granted()) return;
      recordPageView(overrides);
    },
    identify: (id) => {
      if (disposed) return;
      if (id === null) {
        userId = undefined;
      } else if (typeof id === "string" && IDENTIFIER_PATTERN.test(id)) {
        userId = id;
      } else {
        report(
          dropReason(
            "invalid-identifier",
            `identify() takes an opaque id matching ${IDENTIFIER_PATTERN.source}, never an email or a name`,
          ),
        );
      }
    },
    flush: () => (disposed ? Promise.resolve() : delivery.flush()),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      delivery.dispose();
      for (const unsubscribe of unsubscribers) unsubscribe();
      listeners.clear();
    },
  };
};
