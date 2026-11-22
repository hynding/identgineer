import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./constants.ts";
import { createTestDocument } from "./create-test-document.ts";
import { MemoryStorage } from "./memory-storage.ts";
import type { StorageLike } from "./storage.ts";
import { applyVariations, getVariations, resetVariations } from "./variations-state.ts";

const DEFAULTS = {
  theme: "aurora",
  design: "flat",
  layout: "top-bar",
  ux: "comfortable",
  scheme: "system",
} as const;

let doc: Document;
let root: HTMLElement;

beforeEach(() => {
  doc = createTestDocument();
  root = doc.documentElement;
});

describe("getVariations", () => {
  it("reports the defaults, with the scheme following the system, on a bare root", () => {
    expect(getVariations(root)).toEqual(DEFAULTS);
  });

  it("reads the attributes", () => {
    root.setAttribute("data-theme", "ember");
    root.setAttribute("data-design", "glass");
    root.setAttribute("data-layout", "bento");
    root.setAttribute("data-ux", "focus");
    root.setAttribute("data-scheme", "dark");
    expect(getVariations(root)).toEqual({
      theme: "ember",
      design: "glass",
      layout: "bento",
      ux: "focus",
      scheme: "dark",
    });
  });

  it("takes a document as well as an element", () => {
    root.setAttribute("data-theme", "tidal");
    expect(getVariations(doc).theme).toBe("tidal");
  });

  it("falls back to the default for an invalid attribute, and to system for an invalid scheme", () => {
    root.setAttribute("data-theme", "EMBER");
    root.setAttribute("data-design", "<script>");
    root.setAttribute("data-scheme", "sepia");
    expect(getVariations(root)).toEqual(DEFAULTS);
  });

  it("does not read the global document implicitly when there is none", () => {
    expect(getVariations()).toEqual(DEFAULTS);
  });

  it("returns a fresh object each time", () => {
    expect(getVariations(root)).not.toBe(getVariations(root));
  });
});

describe("applyVariations", () => {
  it("sets the attributes and returns the resulting full state", () => {
    const result = applyVariations({ theme: "ember", scheme: "dark" }, { root });
    expect(root.getAttribute("data-theme")).toBe("ember");
    expect(root.getAttribute("data-scheme")).toBe("dark");
    expect(result.state).toEqual({ ...DEFAULTS, theme: "ember", scheme: "dark" });
    expect(result.rejected).toEqual([]);
    expect(result.changed).toEqual(["theme", "scheme"]);
  });

  it("changes only the axes that are present", () => {
    root.setAttribute("data-design", "glass");
    applyVariations({ theme: "ember" }, { root });
    expect(root.getAttribute("data-design")).toBe("glass");
    expect(root.hasAttribute("data-layout")).toBe(false);
    expect(root.hasAttribute("data-ux")).toBe(false);
  });

  it("sets a default explicitly, so a later change of the stylesheet default cannot alter it", () => {
    const result = applyVariations({ theme: "aurora", design: "flat" }, { root });
    expect(root.getAttribute("data-theme")).toBe("aurora");
    expect(root.getAttribute("data-design")).toBe("flat");
    expect(result.changed).toEqual([]);
  });

  it("removes data-scheme for the system scheme", () => {
    root.setAttribute("data-scheme", "dark");
    const result = applyVariations({ scheme: "system" }, { root });
    expect(root.hasAttribute("data-scheme")).toBe(false);
    expect(result.state.scheme).toBe("system");
    expect(result.changed).toEqual(["scheme"]);
  });

  it("ignores and reports invalid values without touching the attribute", () => {
    root.setAttribute("data-theme", "tidal");
    const result = applyVariations({ theme: "nope", design: "glass", ux: 3 } as never, { root });
    expect(root.getAttribute("data-theme")).toBe("tidal");
    expect(root.getAttribute("data-design")).toBe("glass");
    expect(result.rejected).toEqual([
      { axis: "theme", value: "nope" },
      { axis: "ux", value: 3 },
    ]);
    expect(result.state.theme).toBe("tidal");
  });

  it.each([
    [null],
    [undefined],
    ["theme"],
    [42],
    [[]],
    [
      {
        get theme(): string {
          throw new Error("boom");
        },
      },
    ],
  ])("never throws on the bad input %#", (input) => {
    expect(() => applyVariations(input as never, { root })).not.toThrow();
  });

  it("does not throw, and reports the state of the defaults, when there is no root", () => {
    expect(applyVariations({ theme: "ember" })).toEqual({
      state: { ...DEFAULTS, theme: "ember" },
      rejected: [],
      changed: ["theme"],
    });
  });

  it("works on any document, leaving the others alone", () => {
    const other = createTestDocument();
    applyVariations({ theme: "ember" }, { root: other });
    expect(other.documentElement.getAttribute("data-theme")).toBe("ember");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  describe("persistence", () => {
    it("does not touch storage unless asked", () => {
      const storage = new MemoryStorage();
      applyVariations({ theme: "ember" }, { root, storage });
      expect(storage.data.size).toBe(0);
    });

    it("stores the valid choice when asked, merged with what was stored", () => {
      const storage = new MemoryStorage();
      applyVariations({ theme: "ember" }, { root, storage, persist: true });
      applyVariations({ ux: "focus", design: "bad" } as never, { root, storage, persist: true });
      expect(JSON.parse(storage.data.get(STORAGE_KEY) ?? "")).toEqual({
        theme: "ember",
        ux: "focus",
      });
    });

    it("writes nothing when nothing was valid", () => {
      const storage = new MemoryStorage();
      applyVariations({ theme: "bad" } as never, { root, storage, persist: true });
      expect(storage.data.size).toBe(0);
    });

    it("still applies when the storage throws", () => {
      const storage: StorageLike = {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => undefined,
      };
      applyVariations({ theme: "ember" }, { root, storage, persist: true });
      expect(root.getAttribute("data-theme")).toBe("ember");
    });
  });
});

describe("resetVariations", () => {
  it("removes every attribute, so the stylesheet defaults apply again", () => {
    applyVariations(
      { theme: "ember", design: "glass", layout: "bento", ux: "focus", scheme: "dark" },
      { root },
    );
    const result = resetVariations({ root });
    for (const name of ["theme", "design", "layout", "ux", "scheme"]) {
      expect(root.hasAttribute(`data-${name}`)).toBe(false);
    }
    expect(result.state).toEqual(DEFAULTS);
    expect(result.changed).toEqual(["theme", "design", "layout", "ux", "scheme"]);
  });

  it("clears the stored choice only when asked", () => {
    const storage = new MemoryStorage();
    applyVariations({ theme: "ember" }, { root, storage, persist: true });
    resetVariations({ root, storage });
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    resetVariations({ root, storage, persist: true });
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });
});
