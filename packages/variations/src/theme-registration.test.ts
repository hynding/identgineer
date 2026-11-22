import { afterEach, describe, expect, it } from "vitest";
import { createTestDocument } from "./create-test-document.ts";
import { MemoryStorage } from "./memory-storage.ts";
import { getVariations } from "./read-variations.ts";
import { REGISTRY } from "./registry.ts";
import { shuffleVariations } from "./shuffle-variations.ts";
import { STORAGE_KEY } from "./constants.ts";
import { loadVariations } from "./storage.ts";
import { registerThemeIds, type ThemeRegistration } from "./theme-registration.ts";
import { decodeVariations } from "./url.ts";
import { isVariationId, validateVariations } from "./validate.ts";
import { applyVariations } from "./variations-state.ts";

const registrations: ThemeRegistration[] = [];

function register(ids: unknown): ThemeRegistration {
  const registration = registerThemeIds(ids);
  registrations.push(registration);
  return registration;
}

afterEach(() => {
  for (const registration of registrations.splice(0)) registration.unregister();
});

describe("registerThemeIds", () => {
  it("lets a generated theme id through the theme check, and only that check, until unregistered", () => {
    expect(isVariationId("theme", "acme")).toBe(false);
    const registration = register(["acme"]);
    expect(registration.registered).toEqual(["acme"]);
    expect(registration.rejected).toEqual([]);
    expect(isVariationId("theme", "acme")).toBe(true);
    expect(isVariationId("design", "acme")).toBe(false);
    registration.unregister();
    expect(isVariationId("theme", "acme")).toBe(false);
  });

  it.each([
    ["a built-in theme id", "ember"],
    ["a design id", "flat"],
    ["a layout id", "top-bar"],
    ["a UX mode id", "comfortable"],
    ["a CSS-wide keyword", "inherit"],
    ["another CSS-wide keyword", "initial"],
    ["none", "none"],
    ["default", "default"],
    ["a scheme word", "system"],
    ["another scheme word", "light"],
    ["upper case", "Acme"],
    ["an underscore", "acme_co"],
    ["a leading digit", "1acme"],
    ["a trailing hyphen", "acme-"],
    ["a double hyphen", "acme--co"],
    ["one character", "a"],
    ["too long", "a".repeat(33)],
    ["the empty string", ""],
    ["a prototype key", "__proto__"],
    ["constructor", "constructor"],
    ["a quote", 'acme"'],
    ["markup", "<script>"],
    ["a newline", "acme\n"],
    ["a NUL", "acme\0"],
    ["a non-ASCII letter", "acmé"],
    ["a number", 42],
    ["null", null],
    ["a String object", new String("acme")],
    ["an array", ["acme"]],
  ])("refuses %s, never loosening the check", (_label, id) => {
    const registration = register([id]);
    expect(registration.registered).toEqual([]);
    expect(registration.rejected).toEqual([id]);
    expect(isVariationId("theme", id)).toBe(id === "ember");
  });

  it.each([[undefined], [null], ["acme"], [{ 0: "acme", length: 1 }], [42]])(
    "registers nothing from the non-array %s, without throwing",
    (input) => {
      const registration = register(input);
      expect(registration.registered).toEqual([]);
      expect(isVariationId("theme", "acme")).toBe(false);
    },
  );

  it("keeps an id registered twice until both registrations are undone", () => {
    const first = register(["acme"]);
    const second = register(["acme", "globex"]);
    first.unregister();
    expect(isVariationId("theme", "acme")).toBe(true);
    first.unregister();
    expect(isVariationId("theme", "acme")).toBe(true);
    second.unregister();
    expect(isVariationId("theme", "acme")).toBe(false);
    expect(isVariationId("theme", "globex")).toBe(false);
  });

  it("returns frozen lists", () => {
    const registration = register(["acme", "Bad"]);
    expect(Object.isFrozen(registration)).toBe(true);
    expect(Object.isFrozen(registration.registered)).toBe(true);
    expect(Object.isFrozen(registration.rejected)).toBe(true);
  });

  it("is honoured by everything that validates: apply, read back, URL and storage", () => {
    const document = createTestDocument();
    expect(applyVariations({ theme: "acme" } as never, { root: document }).rejected).toEqual([
      { axis: "theme", value: "acme" },
    ]);
    register(["acme"]);
    const { valid } = validateVariations({ theme: "acme" });
    expect(valid).toEqual({ theme: "acme" });
    if (valid.theme === undefined) throw new Error("expected a theme");
    applyVariations({ theme: valid.theme }, { root: document });
    expect(document.documentElement.getAttribute("data-theme")).toBe("acme");
    expect(getVariations(document).theme).toBe("acme");
    expect(decodeVariations("?idg-theme=acme")).toEqual({ theme: "acme" });
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ theme: "acme" }));
    expect(loadVariations(storage)).toEqual({ theme: "acme" });
  });

  it("reads a registered theme left on the page as the default once it is unregistered", () => {
    const document = createTestDocument();
    document.documentElement.setAttribute("data-theme", "acme");
    const registration = register(["acme"]);
    expect(getVariations(document).theme).toBe("acme");
    registration.unregister();
    expect(getVariations(document).theme).toBe(REGISTRY.theme.defaultId);
  });

  it("leaves the registry and shuffling to the built-in themes", () => {
    register(["acme"]);
    expect(REGISTRY.theme.variations.map(({ id }) => id)).not.toContain("acme");
    let calls = 0;
    for (let index = 0; index < 50; index += 1) {
      const state = shuffleVariations(() => (calls++ % 97) / 97);
      expect(state.theme).not.toBe("acme");
    }
  });
});

describe("a stored generated theme on a page that has not registered it", () => {
  function storedWith(value: unknown): MemoryStorage {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return storage;
  }

  function stored(storage: MemoryStorage): unknown {
    return JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
  }

  it("is kept when another axis is persisted, and never applied", () => {
    const storage = storedWith({ theme: "acme", ux: "focus" });
    const root = createTestDocument().documentElement;
    const result = applyVariations({ design: "glass" }, { root, storage, persist: true });
    expect(stored(storage)).toEqual({ theme: "acme", design: "glass", ux: "focus" });
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(result.state.theme).toBe("aurora");
    expect(loadVariations(storage)).toEqual({ design: "glass", ux: "focus" });
  });

  it("applies once a later page registers it", () => {
    const storage = storedWith({ theme: "acme" });
    applyVariations(
      { design: "glass" },
      { root: createTestDocument().documentElement, storage, persist: true },
    );
    register(["acme"]);
    expect(loadVariations(storage)).toEqual({ theme: "acme", design: "glass" });
  });

  it("is replaced by a theme the page chooses", () => {
    const storage = storedWith({ theme: "acme" });
    applyVariations(
      { theme: "ember" },
      { root: createTestDocument().documentElement, storage, persist: true },
    );
    expect(stored(storage)).toEqual({ theme: "ember" });
  });

  it.each([
    ["a reserved id", "flat"],
    ["an id that breaks the slug rule", "Acme"],
    ["an id longer than 32 characters", `a${"b".repeat(32)}`],
    ["a non-string", ["acme"]],
    ["markup", "<script>"],
  ])("is dropped when it is %s", (_label, theme) => {
    const storage = storedWith({ theme });
    applyVariations(
      { design: "glass" },
      { root: createTestDocument().documentElement, storage, persist: true },
    );
    expect(stored(storage)).toEqual({ design: "glass" });
  });

  it("keeps only the one theme slug, nothing else unknown", () => {
    const storage = storedWith({
      theme: "acme",
      extra: "acme",
      design: "nope",
      layout: "unknown-layout",
    });
    applyVariations(
      { ux: "focus" },
      { root: createTestDocument().documentElement, storage, persist: true },
    );
    expect(stored(storage)).toEqual({ theme: "acme", ux: "focus" });
  });
});
