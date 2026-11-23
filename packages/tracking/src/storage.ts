export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StorageArea = "localStorage" | "sessionStorage";

/** Reading the global throws when storage is blocked, and it is absent without a DOM. */
export const browserStorage = (area: StorageArea): StorageLike | undefined => {
  try {
    return (globalThis as Partial<Record<StorageArea, StorageLike>>)[area];
  } catch {
    return undefined;
  }
};

/** The stored text, or `undefined` for a missing key, a failing storage or a value that is not text. */
export const readItem = (storage: StorageLike | undefined, key: string): string | undefined => {
  try {
    const value: unknown = storage?.getItem(key);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
};

/** Whether the value was stored: a full or blocked storage is a `false`, never an exception. */
export const writeItem = (
  storage: StorageLike | undefined,
  key: string,
  value: string,
): boolean => {
  if (storage === undefined) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const removeItem = (storage: StorageLike | undefined, key: string): boolean => {
  if (storage === undefined) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

/**
 * Removes a key only if it is there. A tracker that has nothing stored must not touch storage on
 * its own account, so even a removal of what was never written does not happen.
 */
export const removeItemIfPresent = (storage: StorageLike | undefined, key: string): boolean => {
  if (readItem(storage, key) === undefined) return true;
  return removeItem(storage, key);
};
