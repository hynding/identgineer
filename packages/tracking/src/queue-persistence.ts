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
import { WIRE_VERSION, type TrackingEvent } from "./wire-format.ts";

const MAX_STORED_CHARACTERS = 8 * 1024 * 1024;

export type StoredQueue =
  | { readonly kind: "none" }
  | { readonly kind: "events"; readonly events: readonly TrackingEvent[] };

const parseStored = (text: string): readonly TrackingEvent[] | undefined => {
  if (text.length > MAX_STORED_CHARACTERS) return undefined;
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
  for (const item of events as unknown[]) {
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
export const readStoredQueue = (storage: StorageLike | undefined): StoredQueue => {
  const text = readItem(storage, STORAGE_KEYS.queue);
  if (text === undefined) return { kind: "none" };
  const events = parseStored(text);
  if (events === undefined) {
    removeItem(storage, STORAGE_KEYS.queue);
    return { kind: "none" };
  }
  return { kind: "events", events };
};

/** Stores the queue, or removes its key when it is empty. A full storage is not an error. */
export const writeStoredQueue = (
  storage: StorageLike | undefined,
  entries: readonly QueueEntry[],
): void => {
  if (entries.length === 0) {
    removeItemIfPresent(storage, STORAGE_KEYS.queue);
    return;
  }
  writeItem(
    storage,
    STORAGE_KEYS.queue,
    JSON.stringify({ v: WIRE_VERSION, events: entries.map((entry) => entry.event) }),
  );
};
