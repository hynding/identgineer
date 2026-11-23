import type { StorageLike } from "./storage.ts";
import type { Tracker } from "./tracker-types.ts";

export interface TrackerSlot {
  readonly localStorage: StorageLike | undefined;
  readonly sessionStorage: StorageLike | undefined;
  /** What one tracker is for: its endpoint and write key. */
  readonly key: string;
}

// Keyed by the storage objects themselves, so nothing is kept alive and two pages (or two tests)
// with their own storage never meet. Holding no state until the first tracker is made.
const registry = new WeakMap<object, WeakMap<object, Map<string, Tracker>>>();

const slotsOf = (slot: TrackerSlot): Map<string, Tracker> | undefined => {
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
 * nothing is shared between trackers, so each call makes its own.
 */
export const shareTracker = (slot: TrackerSlot, create: () => Tracker): Tracker => {
  const slots = slotsOf(slot);
  const existing = slots?.get(slot.key);
  if (existing !== undefined) return existing;
  const made = create();
  if (slots === undefined) return made;
  const shared: Tracker = {
    ...made,
    dispose: () => {
      made.dispose();
      if (slots.get(slot.key) === shared) slots.delete(slot.key);
    },
  };
  slots.set(slot.key, shared);
  return shared;
};
