import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "./memory-storage.ts";

describe("createMemoryStorage", () => {
  it("stores, reads and removes text, and reads null for a missing key", () => {
    const storage = createMemoryStorage();
    expect(storage.getItem("a")).toBeNull();
    storage.setItem("a", "1");
    expect(storage.getItem("a")).toBe("1");
    storage.removeItem("a");
    expect(storage.getItem("a")).toBeNull();
  });

  it("stores what it is given as text, as Web Storage does", () => {
    const storage = createMemoryStorage();
    storage.setItem("a", 5 as unknown as string);
    expect(storage.getItem("a")).toBe("5");
  });

  it("logs every call in order", () => {
    const storage = createMemoryStorage();
    storage.getItem("a");
    storage.setItem("a", "1");
    storage.removeItem("a");
    expect(storage.calls).toEqual([
      { method: "getItem", key: "a" },
      { method: "setItem", key: "a" },
      { method: "removeItem", key: "a" },
    ]);
  });

  it("tells an observer about each call as it happens, before it takes effect", () => {
    const storage = createMemoryStorage();
    const seen: (string | null)[] = [];
    storage.observe((call) => {
      if (call.method === "setItem") seen.push(storage.peek(call.key));
    });
    storage.setItem("a", "1");
    expect(seen).toEqual([null]);
  });

  it("lets a test look and seed without leaving a call behind", () => {
    const storage = createMemoryStorage();
    storage.seed("a", "1");
    expect(storage.peek("a")).toBe("1");
    expect(storage.keys()).toEqual(["a"]);
    expect(storage.calls).toEqual([]);
  });

  it("throws a SecurityError from every call while failing", () => {
    const storage = createMemoryStorage();
    storage.setItem("a", "1");
    storage.failAll(true);
    for (const call of [
      () => storage.getItem("a"),
      () => {
        storage.setItem("a", "2");
      },
      () => {
        storage.removeItem("a");
      },
    ]) {
      expect(call).toThrow(expect.objectContaining({ name: "SecurityError" }));
    }
    storage.failAll(false);
    expect(storage.getItem("a")).toBe("1");
  });

  it("throws a QuotaExceededError from writes alone while failing them", () => {
    const storage = createMemoryStorage();
    storage.seed("a", "1");
    storage.failWrites(true);
    expect(() => {
      storage.setItem("b", "2");
    }).toThrow(expect.objectContaining({ name: "QuotaExceededError" }));
    expect(storage.getItem("a")).toBe("1");
    expect(storage.peek("b")).toBeNull();
    storage.removeItem("a");
    expect(storage.peek("a")).toBeNull();
  });

  it("refuses a write beyond its quota and keeps the old value", () => {
    const storage = createMemoryStorage({ quotaCharacters: 10 });
    storage.setItem("k", "12345");
    expect(() => {
      storage.setItem("k", "12345678901");
    }).toThrow(expect.objectContaining({ name: "QuotaExceededError" }));
    expect(storage.getItem("k")).toBe("12345");
    storage.setItem("k", "12345678");
    expect(storage.getItem("k")).toBe("12345678");
  });

  it("can fail reads alone, as a storage that only throws on getItem does", () => {
    const storage = createMemoryStorage();
    storage.seed("a", "1");
    storage.failReads(true);
    expect(() => storage.getItem("a")).toThrow();
    storage.setItem("b", "2");
    storage.removeItem("a");
    storage.failReads(false);
    expect(storage.getItem("a")).toBeNull();
    expect(storage.getItem("b")).toBe("2");
  });
});
