import type { StorageLike } from "./storage.ts";
import type { Tracker } from "./tracker-types.ts";

export interface TrackerSlot {
  readonly localStorage: StorageLike | undefined;
  readonly sessionStorage: StorageLike | undefined;
  /** What one tracker is for: its endpoint and write key. */
  readonly key: string;
}

interface Shared {
  readonly tracker: Tracker;
  /** The options a later call cannot change: what the first call was made with. */
  readonly signature: string;
}

// Keyed by the storage objects themselves, so nothing is kept alive and two pages (or two tests)
// with their own storage never meet. Holding no state until the first tracker is made.
const registry = new WeakMap<object, WeakMap<object, Map<string, Shared>>>();

const slotsOf = (slot: TrackerSlot): Map<string, Shared> | undefined => {
  const { localStorage, sessionStorage } = slot;
  if (localStorage === undefined || sessionStorage === undefined) return undefined;
  let bySession = registry.get(localStorage);
  if (bySession === undefined) {
    bySession = new WeakMap();
    registry.set(localStorage, bySession);
  }
  let byKey = bySession.get(sessionStorage);
  if (byKey === undefined) {
    byKey = new Map();
    bySession.set(sessionStorage, byKey);
  }
  return byKey;
};

/**
 * The tracker already made for this slot and not yet disposed, or a new one. Without both storages
 * nothing is shared between trackers, so each call makes its own. A call that finds one made with
 * a different `signature` is told so through `onMismatch`, once: its options were ignored.
 */
export const shareTracker = (
  slot: TrackerSlot,
  signature: string,
  create: () => Tracker,
  onMismatch: () => void,
): Tracker => {
  const slots = slotsOf(slot);
  const existing = slots?.get(slot.key);
  if (existing !== undefined) {
    if (existing.signature !== signature) onMismatch();
    return existing.tracker;
  }
  const made = create();
  if (slots === undefined) return made;
  const shared: Tracker = {
    ...made,
    dispose: () => {
      made.dispose();
      if (slots.get(slot.key)?.tracker === shared) slots.delete(slot.key);
    },
  };
  slots.set(slot.key, { tracker: shared, signature });
  return shared;
};
