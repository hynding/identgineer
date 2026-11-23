import { parseTrackingEvent } from "./parse-tracking-batch.ts";
import type { QueueEntry } from "./event-queue.ts";
import {
  readItem,
  removeItem,
  removeItemIfPresent,
  writeItem,
  type StorageLike,
} from "./storage.ts";
import { STORAGE_KEYS } from "./storage-keys.ts";
import { utf8Length } from "./utf8-length.ts";
import { WIRE_VERSION, type TrackingEvent } from "./wire-format.ts";

/** Characters of stored text allowed per byte of `maxQueueBytes`: JSON escapes can widen text. */
const CHARACTERS_PER_QUEUE_BYTE = 4;

export type StoredQueue =
  | { readonly kind: "none" }
  | { readonly kind: "events"; readonly events: readonly TrackingEvent[] };

const parseStored = (
  text: string,
  limits: StoredQueueLimits,
): readonly TrackingEvent[] | undefined => {
  // Refused by length before it is parsed: a value no tab could have written under these caps.
  if (text.length > limits.maxBytes * CHARACTERS_PER_QUEUE_BYTE) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  if (Object.keys(parsed).sort().join(",") !== "events,v") return undefined;
  const { v, events } = parsed as Record<string, unknown>;
  if (v !== WIRE_VERSION || !Array.isArray(events)) return undefined;
  const checked: TrackingEvent[] = [];
  // Only the newest events that fit the cap are looked at; the rest would be dropped anyway.
  for (const item of (events as unknown[]).slice(-limits.maxEvents)) {
    const result = parseTrackingEvent(item);
    if (!result.ok) return undefined;
    checked.push(result.value);
  }
  return checked;
};

/**
 * What the offline queue holds. Anything malformed discards the whole stored queue, which is
 * removed: a queue that cannot be trusted in part cannot be trusted at all.
 */
export const readStoredQueue = (
  storage: StorageLike | undefined,
  limits: StoredQueueLimits,
): StoredQueue => {
  const text = readItem(storage, STORAGE_KEYS.queue);
  if (text === undefined) return { kind: "none" };
  const events = parseStored(text, limits);
  if (events === undefined) {
    removeItem(storage, STORAGE_KEYS.queue);
    return { kind: "none" };
  }
  return { kind: "events", events };
};

export interface StoredQueueLimits {
  readonly maxEvents: number;
  readonly maxBytes: number;
}

// The session id is the one thing that must not reach localStorage, where it would outlive the
// tab and link this page load to the next.
const withoutSession = (event: TrackingEvent): TrackingEvent => {
  const { id, name, at, user, path, referrer, properties } = event;
  return {
    id,
    name,
    at,
    ...(user === undefined ? {} : { user }),
    ...(path === undefined ? {} : { path }),
    ...(referrer === undefined ? {} : { referrer }),
    ...(properties === undefined ? {} : { properties }),
  };
};

const sizeOf = (event: TrackingEvent): number => utf8Length(JSON.stringify(event));

const holdLimits = (
  events: readonly TrackingEvent[],
  limits: StoredQueueLimits,
): readonly TrackingEvent[] => {
  const sizes = events.map(sizeOf);
  let bytes = sizes.reduce((sum, size) => sum + size, 0);
  // One pass from the oldest end: the first event that can stay marks where the kept ones begin.
  let dropped = 0;
  while (
    dropped < events.length &&
    (events.length - dropped > limits.maxEvents || bytes > limits.maxBytes)
  ) {
    bytes -= sizes[dropped] ?? 0;
    dropped += 1;
  }
  return dropped === 0 ? events : events.slice(dropped);
};

/**
 * Stores this tab's queue merged, by event id, with what the storage already holds, so that a
 * tab never erases what another tab queued. `gone` holds the ids this tab delivered or dropped:
 * only those are removed from what is stored. The oldest events go first when a cap is exceeded,
 * and an empty result removes the key. A full storage is not an error; the result says whether
 * the storage now reflects the queue.
 */
export const writeStoredQueue = (
  storage: StorageLike | undefined,
  entries: readonly QueueEntry[],
  gone: ReadonlySet<string>,
  limits: StoredQueueLimits,
): boolean => {
  const stored = readStoredQueue(storage, limits);
  const merged = new Map<string, TrackingEvent>();
  if (stored.kind === "events") {
    for (const event of stored.events) if (!gone.has(event.id)) merged.set(event.id, event);
  }
  for (const entry of entries) merged.set(entry.event.id, withoutSession(entry.event));
  // Date order, and a stable sort, so equal timestamps keep the order they were stored in.
  const events = holdLimits(
    [...merged.values()].sort((first, second) => first.at - second.at),
    limits,
  );
  if (events.length === 0) return removeItemIfPresent(storage, STORAGE_KEYS.queue);
  return writeItem(storage, STORAGE_KEYS.queue, JSON.stringify({ v: WIRE_VERSION, events }));
};
