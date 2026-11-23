import type { StorageLike } from "../storage.ts";

export interface StorageCall {
  readonly method: "getItem" | "setItem" | "removeItem";
  readonly key: string;
}

export interface MemoryStorageOptions {
  /** Keys plus values may not exceed this many characters; a write beyond it throws. */
  readonly quotaCharacters?: number;
}

/** A `Storage` in memory that logs its calls and can be made to fail as a hostile browser would. */
export interface MemoryStorage extends StorageLike {
  readonly calls: readonly StorageCall[];
  /** Hears each call as it is made, before it takes effect. Returns the function that stops it. */
  readonly observe: (listener: (call: StorageCall) => void) => () => void;
  /** Reads without leaving a call behind. */
  readonly peek: (key: string) => string | null;
  /** Writes without leaving a call behind. */
  readonly seed: (key: string, value: string) => void;
  readonly keys: () => string[];
  /** Every call throws a SecurityError, as storage blocked by the browser does. */
  readonly failAll: (failing: boolean) => void;
  /** Every write throws a QuotaExceededError; reads and removals still work. */
  readonly failWrites: (failing: boolean) => void;
  /** Every `getItem` throws; writes and removals still work. */
  readonly failReads: (failing: boolean) => void;
}

export const createMemoryStorage = (options: MemoryStorageOptions = {}): MemoryStorage => {
  const values = new Map<string, string>();
  const calls: StorageCall[] = [];
  const observers = new Set<(call: StorageCall) => void>();
  let allFail = false;
  let writesFail = false;
  let readsFail = false;

  const record = (method: StorageCall["method"], key: string): void => {
    const call = { method, key };
    calls.push(call);
    for (const observer of [...observers]) observer(call);
    if (allFail) throw new DOMException("Storage is blocked", "SecurityError");
  };
  const characters = (): number =>
    [...values].reduce((sum, [key, value]) => sum + key.length + value.length, 0);

  return {
    calls,
    observe: (listener) => {
      observers.add(listener);
      return () => {
        observers.delete(listener);
      };
    },
    peek: (key) => values.get(key) ?? null,
    seed: (key, value) => {
      values.set(key, value);
    },
    keys: () => [...values.keys()],
    failAll: (failing) => {
      allFail = failing;
    },
    failWrites: (failing) => {
      writesFail = failing;
    },
    failReads: (failing) => {
      readsFail = failing;
    },
    getItem: (key) => {
      record("getItem", key);
      if (readsFail) throw new DOMException("Storage cannot be read", "SecurityError");
      return values.get(key) ?? null;
    },
    setItem: (key, value) => {
      record("setItem", key);
      // Web Storage turns whatever it is given into text.
      const text = typeof value === "string" ? value : String(value);
      const replaced = values.has(key) ? key.length + (values.get(key)?.length ?? 0) : 0;
      const after = characters() - replaced + key.length + text.length;
      if (
        writesFail ||
        (options.quotaCharacters !== undefined && after > options.quotaCharacters)
      ) {
        throw new DOMException("The quota has been exceeded", "QuotaExceededError");
      }
      values.set(key, text);
    },
    removeItem: (key) => {
      record("removeItem", key);
      values.delete(key);
    },
  };
};
