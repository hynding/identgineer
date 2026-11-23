import { describe, expect, it } from "vitest";
import { MAX_STORED_LENGTH, STORAGE_KEY } from "./constants.ts";
import { MemoryStorage } from "./memory-storage.ts";
import { clearStoredVariations, loadVariations, saveVariations } from "./storage.ts";
import type { StorageLike } from "./storage.ts";

const THROWING: StorageLike = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
};

describe("storage", () => {
  it("keeps the choice as JSON under one versioned key", () => {
    const storage = new MemoryStorage();
    expect(saveVariations({ theme: "ember", scheme: "dark" }, storage)).toBe(true);
    expect([...storage.data.keys()]).toEqual([STORAGE_KEY]);
    expect(STORAGE_KEY).toMatch(/:v1$/);
    expect(JSON.parse(storage.data.get(STORAGE_KEY) ?? "")).toEqual({
      theme: "ember",
      scheme: "dark",
    });
  });

  it("loads what was saved", () => {
    const storage = new MemoryStorage();
    const choice = {
      theme: "ember",
      design: "glass",
      layout: "bento",
      ux: "focus",
      scheme: "dark",
    };
    saveVariations(choice as never, storage);
    expect(loadVariations(storage)).toEqual(choice);
  });

  it("writes only valid fields", () => {
    const storage = new MemoryStorage();
    saveVariations({ theme: "ember", design: "<script>" } as never, storage);
    expect(loadVariations(storage)).toEqual({ theme: "ember" });
    expect(storage.data.get(STORAGE_KEY)).not.toContain("script");
  });

  it("loads nothing when nothing was saved", () => {
    expect(loadVariations(new MemoryStorage())).toEqual({});
  });

  it("validates every field it reads and ignores unknown keys", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme: "ember",
        design: "Glass",
        layout: 7,
        ux: "__proto__",
        scheme: "dark",
        extra: "<img onerror=x>",
      }),
    );
    expect(loadVariations(storage)).toEqual({ theme: "ember", scheme: "dark" });
  });

  it("does not let a stored __proto__ key reach the result", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{"__proto__":{"theme":"ember"},"design":"glass"}');
    const loaded = loadVariations(storage);
    expect(loaded).toEqual({ design: "glass" });
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a JSON string", '"ember"'],
    ["a JSON number", "42"],
    ["JSON null", "null"],
    ["a JSON array", '["ember"]'],
    ["an empty string", ""],
  ])("ignores %s", (_name, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    expect(loadVariations(storage)).toEqual({});
  });

  it("caps the size it will read, without parsing what is over it", () => {
    const storage = new MemoryStorage();
    const padding = " ".repeat(MAX_STORED_LENGTH);
    storage.setItem(STORAGE_KEY, `{"theme":"ember"${padding}}`);
    expect(loadVariations(storage)).toEqual({});
    storage.setItem(STORAGE_KEY, `{"theme":"ember"}`);
    expect(loadVariations(storage)).toEqual({ theme: "ember" });
  });

  it("clears the stored choice and nothing else", () => {
    const storage = new MemoryStorage();
    storage.setItem("other", "kept");
    saveVariations({ theme: "ember" }, storage);
    expect(clearStoredVariations(storage)).toBe(true);
    expect([...storage.data.entries()]).toEqual([["other", "kept"]]);
  });

  it("never throws when the storage does", () => {
    expect(loadVariations(THROWING)).toEqual({});
    expect(saveVariations({ theme: "ember" }, THROWING)).toBe(false);
    expect(clearStoredVariations(THROWING)).toBe(false);
  });

  it("never throws when a stored value is not a string", () => {
    const storage: StorageLike = {
      getItem: () => ({}) as never,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadVariations(storage)).toEqual({});
  });

  it("does nothing, and does not throw, when the environment has no storage", () => {
    expect(typeof (globalThis as { localStorage?: unknown }).localStorage).toBe("undefined");
    expect(loadVariations()).toEqual({});
    expect(saveVariations({ theme: "ember" })).toBe(false);
    expect(clearStoredVariations()).toBe(false);
  });
});
