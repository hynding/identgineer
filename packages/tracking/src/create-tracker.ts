import {
  buildCustomEvent,
  buildPageView,
  type BuildResult,
  type EventSource,
} from "./build-event.ts";
import { createConsentController } from "./consent-controller.ts";
import { CONSENT_CHANGED, isConsentNotice } from "./cross-tab.ts";
import { createDelivery } from "./delivery.ts";
import { removeDeliveredIds } from "./delivered-marker.ts";
import { dropReason, type DropReason } from "./drop-reason.ts";
import { minimisePath } from "./minimise-url.ts";
import { resolveOptions, type ResolvedOptions } from "./resolve-options.ts";
import { createSessionStore } from "./session-store.ts";
import { shareTracker } from "./tracker-registry.ts";
import { removeItemIfPresent } from "./storage.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";
import type { ConsentStatus, Tracker, TrackerOptions } from "./tracker-types.ts";
import { IDENTIFIER_PATTERN } from "./wire-format.ts";
import type { ConsentReading } from "./consent-controller.ts";

function withDecisionTime(reading: ConsentReading): ConsentStatus {
  return { ...reading.status, decidedAt: reading.decidedAt ?? null };
}

const buildTracker = (options: ResolvedOptions): Tracker => {
  const { page, localStorage, crossTab } = options;

  const controller = createConsentController({
    storage: localStorage,
    version: options.consentVersion,
    now: () => options.clock.now(),
    signals: () => page.signals(),
  });
  const sessions = createSessionStore({
    storage: options.sessionStorage,
    clock: options.clock,
    crypto: options.crypto,
    timeout: options.sessionTimeout,
  });

  const first = controller.read();
  let status: ConsentStatus = withDecisionTime(first);
  // The decision this tab has acted on; a different one under a standing grant is a revocation.
  let decidedAt = first.decidedAt;
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

  // A listener may call the tracker back and so cause another change. Changes are announced one
  // at a time and in order, so no listener hears a later status before an earlier one.
  const unannounced: ConsentStatus[] = [];
  let announcing = false;
  const notify = (next: ConsentStatus): void => {
    unannounced.push(next);
    if (announcing) return;
    announcing = true;
    try {
      for (let change = unannounced.shift(); change !== undefined; change = unannounced.shift()) {
        for (const listener of [...listeners]) {
          if (disposed) break;
          try {
            listener(change);
          } catch {
            // One listener's failure is not another's.
          }
        }
      }
    } finally {
      announcing = false;
    }
  };

  // What revoking consent undoes: the queue, its stored copy, the session and the identified user.
  const discard = (): void => {
    delivery.revoke();
    sessions.clear();
    userId = undefined;
    lastAutoPath = undefined;
    removeItemIfPresent(localStorage, STORAGE_KEYS.queue);
    removeDeliveredIds(localStorage);
  };

  // Reads consent afresh, so a change made in another tab, or a browser signal that appeared,
  // takes effect at the next use even when no notice reached this tab.
  const refresh = (ownDecision = false): ConsentStatus => {
    if (disposed) return status;
    const reading = controller.read();
    const next = withDecisionTime(reading);
    const previous = status;
    const seen = decidedAt;
    status = next;
    decidedAt = reading.decidedAt;
    const reGranted =
      previous.state === "granted" &&
      next.state === "granted" &&
      !ownDecision &&
      reading.decidedAt !== seen;
    if ((previous.state === "granted" && next.state !== "granted") || reGranted) discard();
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
    // The reports ran the page's code, which may have revoked consent or disposed the tracker.
    if (built.event !== undefined && granted()) delivery.enqueue(built.event);
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
    const next = refresh(true);
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

// Key order must not matter: two declarations of the same events are the same.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : typeof value === "object" && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([first], [second]) => (first < second ? -1 : 1))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;

const signatureOf = (consentVersion: number, events: unknown): string => {
  try {
    return JSON.stringify([consentVersion, canonical(events)]);
  } catch {
    return String(consentVersion);
  }
};

/**
 * Creates a tracker. Consent comes first: until the visitor grants it (and no browser signal says
 * otherwise) nothing is sent, queued, or written to any storage but the consent record itself.
 * Throws a `TypeError` for an invalid option; after that no method ever throws.
 *
 * A page has one tracker per endpoint and write key: a second call that finds the first still
 * undisposed (same storages) returns that tracker and ignores its other options (`consentVersion` and `events` included, which `onDrop` is told once), because two
 * trackers on the same storage keys would each hold a queue, a session and a timer for them.
 */
export const createTracker = (trackerOptions: TrackerOptions): Tracker => {
  const options = resolveOptions(trackerOptions);
  return shareTracker(
    {
      localStorage: options.localStorage,
      sessionStorage: options.sessionStorage,
      key: `${options.endpoint}\n${options.writeKey}`,
    },
    signatureOf(options.consentVersion, trackerOptions.events),
    () => buildTracker(options),
    () => {
      try {
        options.onDrop(
          dropReason(
            "tracker-options-ignored",
            "a tracker for this endpoint and write key already exists: it is returned, and the consentVersion and events given here are ignored",
          ),
        );
      } catch {
        // A page's reporter must never break the page.
      }
    },
  );
};
