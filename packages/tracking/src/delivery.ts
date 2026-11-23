import { retryDelay } from "./backoff.ts";
import { dropReason, type DropReason } from "./drop-reason.ts";
import { createEventQueue, type QueueEntry } from "./event-queue.ts";
import { readStoredQueue, writeStoredQueue } from "./queue-persistence.ts";
import type { ResolvedOptions } from "./resolve-options.ts";
import { sendByBeacon, sendByFetch } from "./send-batch.ts";
import { serialiseBatch } from "./serialise-batch.ts";
import { utf8Length } from "./utf8-length.ts";
import type { TrackingEvent } from "./wire-format.ts";

/** Events older than this are never sent: what they describe is too stale to be worth the data. */
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

export interface DeliveryDeps {
  readonly options: ResolvedOptions;
  /** Whether sending and storing are allowed right now; consults effective consent afresh. */
  readonly allowed: () => boolean;
  readonly report: (reason: DropReason) => void;
}

export interface Delivery {
  readonly enqueue: (event: TrackingEvent) => void;
  /** Takes up the events an earlier page left in storage. */
  readonly loadStored: () => void;
  readonly flush: () => Promise<void>;
  /** The page is going away: send what is queued by beacon, or a keepalive fetch. */
  readonly flushOnHide: () => void;
  /** The browser is back online. */
  readonly resume: () => void;
  /** Consent was revoked: forget everything held, cancel timers and ignore what is in flight. */
  readonly revoke: () => void;
  readonly dispose: () => void;
}

/**
 * The batch queue and its delivery: one request in flight at a time, retried with backoff, held
 * while offline, persisted while consent stands. A request already in flight cannot be recalled,
 * but once it is answered nothing follows from the answer if consent was revoked meanwhile.
 */
export const createDelivery = (deps: DeliveryDeps): Delivery => {
  const { options, allowed, report } = deps;
  const { clock } = options;
  const queue = createEventQueue({
    maxEvents: options.maxQueueEvents,
    maxBytes: options.maxQueueBytes,
  });

  let timer: unknown;
  let timerDue = 0;
  let loop: Promise<void> | undefined;
  let attempts = 0;
  let nextAttemptAt = 0;
  // Bumped on revocation: a request answered under an older epoch is moot.
  let epoch = 0;
  let restartNeeded = false;
  let disposed = false;

  const clearTimer = (): void => {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
  };

  // The earlier of the pending timer and this one wins; the loop re-arms what is still due.
  const armTimer = (delay: number): void => {
    const due = clock.now() + delay;
    if (timer !== undefined && timerDue <= due) return;
    clearTimer();
    timerDue = due;
    timer = clock.setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
  };

  const persist = (): void => {
    if (allowed()) writeStoredQueue(options.localStorage, queue.entries());
  };

  const overhead = (withKey: boolean): number =>
    utf8Length(serialiseBatch([], clock.now(), withKey ? options.writeKey : undefined));

  const reportOverflow = (dropped: number): void => {
    if (dropped > 0) {
      report(
        dropReason(
          "queue-overflow",
          `${String(dropped)} queued events were dropped to hold the queue's limits`,
        ),
      );
    }
  };

  const dropExpired = (): void => {
    const cutoff = clock.now() - MAX_EVENT_AGE_MS;
    const stale = queue.entries().filter((entry) => entry.event.at < cutoff);
    if (stale.length === 0) return;
    queue.remove(new Set(stale.map((entry) => entry.event.id)));
    report(dropReason("expired", `${String(stale.length)} queued events were older than 24 hours`));
    persist();
  };

  // As many events as fit the batch size and the payload cap, always at least the first.
  const planBatch = (withKey: boolean): QueueEntry[] => {
    let total = overhead(withKey);
    const picked: QueueEntry[] = [];
    for (const entry of queue.entries()) {
      if (picked.length >= options.maxBatchSize) break;
      const added = entry.bytes + (picked.length > 0 ? 1 : 0);
      if (picked.length > 0 && total + added > options.maxPayloadBytes) break;
      picked.push(entry);
      total += added;
    }
    return picked;
  };

  const isOnline = (): boolean => {
    try {
      return options.page.signals().onLine !== false;
    } catch {
      return true;
    }
  };

  const waitingForBackoff = (): boolean => {
    const remaining = nextAttemptAt - clock.now();
    if (remaining <= 0) return false;
    armTimer(remaining);
    return true;
  };

  const ready = (): boolean =>
    !disposed && options.fetch !== undefined && allowed() && isOnline() && !waitingForBackoff();

  const run = async (keepalive: boolean): Promise<void> => {
    const { fetch } = options;
    if (fetch === undefined) return;
    for (;;) {
      if (!ready()) return;
      dropExpired();
      const batch = planBatch(false);
      if (batch.length === 0) return;
      const ids = new Set(batch.map((entry) => entry.event.id));
      const startedIn = epoch;
      const outcome = await sendByFetch(
        { fetch, endpoint: options.endpoint, writeKey: options.writeKey, now: () => clock.now() },
        serialiseBatch(
          batch.map((entry) => entry.event),
          clock.now(),
        ),
        keepalive,
      );
      if (disposed) return;
      if (epoch !== startedIn) {
        restartNeeded = true;
        return;
      }
      if (outcome.kind === "retry") {
        attempts += 1;
        const delay = retryDelay(attempts, outcome.retryAfterSeconds, options.random);
        nextAttemptAt = clock.now() + delay;
        armTimer(delay);
        return;
      }
      attempts = 0;
      queue.remove(ids);
      if (outcome.kind === "rejected") {
        report(
          dropReason(
            "rejected-by-server",
            `the collector answered ${String(outcome.status)}; the batch was dropped`,
          ),
        );
      }
      persist();
    }
  };

  const startLoop = (keepalive: boolean): Promise<void> => {
    clearTimer();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    loop = current;
    void run(keepalive)
      .catch(() => undefined)
      .finally(() => {
        loop = undefined;
        release();
        if (disposed) return;
        if (queue.size() === 0) clearTimer();
        else if (restartNeeded) armTimer(options.flushInterval);
        restartNeeded = false;
      });
    return current;
  };

  function flush(): Promise<void> {
    if (disposed) return Promise.resolve();
    return loop ?? startLoop(false);
  }

  const takeStored = (): void => {
    const stored = readStoredQueue(options.localStorage);
    if (stored.kind === "none") return;
    const cutoff = clock.now() - MAX_EVENT_AGE_MS;
    const seen = new Set<string>();
    const entries: QueueEntry[] = [];
    let expired = 0;
    for (const event of stored.events) {
      if (event.at < cutoff) expired += 1;
      else if (!seen.has(event.id)) {
        seen.add(event.id);
        const bytes = utf8Length(JSON.stringify(event));
        if (overhead(true) + bytes > options.maxPayloadBytes) {
          report(
            dropReason("event-too-large", `stored event "${event.name}" is over the payload cap`),
          );
        } else entries.push({ event, bytes });
      }
    }
    if (expired > 0)
      report(dropReason("expired", `${String(expired)} stored events were older than 24 hours`));
    reportOverflow(queue.prepend(entries));
    persist();
    if (queue.size() > 0) armTimer(options.flushInterval);
  };

  return {
    enqueue: (event) => {
      if (disposed) return;
      const bytes = utf8Length(JSON.stringify(event));
      if (overhead(true) + bytes > options.maxPayloadBytes) {
        report(
          dropReason(
            "event-too-large",
            `event "${event.name}" alone is over the payload cap of ${String(options.maxPayloadBytes)} bytes`,
          ),
        );
        return;
      }
      reportOverflow(queue.push({ event, bytes }));
      persist();
      armTimer(options.flushInterval);
      if (queue.size() >= options.maxBatchSize) void flush();
    },
    loadStored: takeStored,
    flush,
    flushOnHide: () => {
      if (disposed || loop !== undefined || !allowed() || !isOnline()) return;
      if (clock.now() < nextAttemptAt) return;
      dropExpired();
      for (let batch = planBatch(true); batch.length > 0; batch = planBatch(true)) {
        const { sendBeacon } = options;
        const body = serialiseBatch(
          batch.map((entry) => entry.event),
          clock.now(),
          options.writeKey,
        );
        if (sendBeacon === undefined || !sendByBeacon(sendBeacon, options.endpoint, body)) break;
        queue.remove(new Set(batch.map((entry) => entry.event.id)));
      }
      persist();
      if (queue.size() > 0 && options.fetch !== undefined) void startLoop(true);
    },
    resume: () => {
      void flush();
    },
    revoke: () => {
      epoch += 1;
      queue.clear();
      clearTimer();
      attempts = 0;
      nextAttemptAt = 0;
      restartNeeded = false;
    },
    dispose: () => {
      disposed = true;
      clearTimer();
      queue.clear();
    },
  };
};
