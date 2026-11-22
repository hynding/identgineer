import { MAX_STORED_LENGTH, STORAGE_KEY } from "./constants.ts";
import { parseVariations } from "./validate.ts";
import type { VariationState } from "./variation-state.ts";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Reading `localStorage` itself throws when storage is blocked, and the global is absent in SSR.
function defaultStorage(): StorageLike | undefined {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage;
  } catch {
    return undefined;
  }
}

/** Persistence is a convenience: every failure (private mode, quota, blocked) is reported as `false` or empty, never thrown. */
export function saveVariations(
  state: Partial<VariationState>,
  storage: StorageLike | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(parseVariations(state)));
    return true;
  } catch {
    return false;
  }
}

export function loadVariations(
  storage: StorageLike | undefined = defaultStorage(),
): Partial<VariationState> {
  if (!storage) return {};
  try {
    const raw: unknown = storage.getItem(STORAGE_KEY);
    if (typeof raw !== "string" || raw.length > MAX_STORED_LENGTH) return {};
    return parseVariations(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function clearStoredVariations(
  storage: StorageLike | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
