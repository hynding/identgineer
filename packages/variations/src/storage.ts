import { MAX_STORED_LENGTH, STORAGE_KEY } from "./constants.ts";
import { isAddableThemeId } from "./theme-registration.ts";
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

// The stored value as JSON, or undefined for anything this package would not have written.
function readStored(storage: StorageLike): unknown {
  try {
    const raw: unknown = storage.getItem(STORAGE_KEY);
    if (typeof raw !== "string" || raw.length > MAX_STORED_LENGTH) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function loadVariations(
  storage: StorageLike | undefined = defaultStorage(),
): Partial<VariationState> {
  return storage ? parseVariations(readStored(storage)) : {};
}

/**
 * A stored theme that passes the added theme id rule although this page has not registered it:
 * a generated theme chosen on a page that did. It is kept, never applied.
 */
function storedAddedTheme(stored: unknown): string | undefined {
  if (typeof stored !== "object" || stored === null || !("theme" in stored)) return undefined;
  return isAddableThemeId(stored.theme) ? stored.theme : undefined;
}

/**
 * Stores `choice` merged over the stored choice. Of what the page cannot validate, only one theme
 * slug that passes the added theme id rule survives, so choosing another axis here does not
 * forget a generated theme that a page registering it would apply.
 */
export function mergeStoredVariations(
  choice: Partial<VariationState>,
  storage: StorageLike | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  const stored = readStored(storage);
  const merged = { ...parseVariations(stored), ...parseVariations(choice) };
  const kept = merged.theme === undefined ? storedAddedTheme(stored) : undefined;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(kept === undefined ? merged : { theme: kept, ...merged }),
    );
    return true;
  } catch {
    return false;
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
