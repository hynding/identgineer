import { afterEach, describe, expect, it, vi } from "vitest";
import { browserStorage, readItem, removeItem, removeItemIfPresent, writeItem } from "./storage.ts";
import { createMemoryStorage } from "./testing/memory-storage.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storage helpers", () => {
  it("find no storage without a DOM", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(browserStorage("localStorage")).toBeUndefined();
  });

  it("find no storage when merely reading the global throws", () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      expect(browserStorage("sessionStorage")).toBeUndefined();
    } finally {
      Reflect.deleteProperty(globalThis, "sessionStorage");
    }
  });

  it("find the browser's storage", () => {
    const storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(browserStorage("localStorage")).toBe(storage);
  });

  it("read text, and nothing for a missing key, a failure or a value that is not text", () => {
    const storage = createMemoryStorage();
    storage.seed("a", "1");
    expect(readItem(storage, "a")).toBe("1");
    expect(readItem(storage, "b")).toBeUndefined();
    expect(readItem(undefined, "a")).toBeUndefined();
    expect(readItem({ getItem: () => 5 as never, setItem: () => undefined, removeItem: () => undefined }, "a")).toBeUndefined();
    storage.failAll(true);
    expect(readItem(storage, "a")).toBeUndefined();
  });

  it("write and remove, answering false instead of throwing", () => {
    const storage = createMemoryStorage();
    expect(writeItem(storage, "a", "1")).toBe(true);
    expect(removeItem(storage, "a")).toBe(true);
    expect(writeItem(undefined, "a", "1")).toBe(false);
    expect(removeItem(undefined, "a")).toBe(false);
    storage.failAll(true);
    expect(writeItem(storage, "a", "1")).toBe(false);
    expect(removeItem(storage, "a")).toBe(false);
  });

  it("remove a key only when it is there", () => {
    const storage = createMemoryStorage();
    expect(removeItemIfPresent(storage, "a")).toBe(true);
    expect(storage.calls.map((call) => call.method)).toEqual(["getItem"]);
    storage.seed("a", "1");
    expect(removeItemIfPresent(storage, "a")).toBe(true);
    expect(storage.peek("a")).toBeNull();
  });
});
