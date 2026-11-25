import { readFileSync } from "node:fs";
import { parseBrandKit, sanitiseSvgLogo, type BrandKit } from "@identgineer/brand";
import { describe, expect, it, vi } from "vitest";
import {
  colourPickerValue,
  draftFromKit,
  EMPTY_DRAFT,
  hexOf,
  previewOf,
  validateDraft,
  type BrandDraft,
} from "./brand-editor-draft";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);

function kitOf(file: string): BrandKit {
  const result = parseBrandKit(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")));
  if (!result.ok) throw new Error(`${file} is not a kit`);
  return result.kit;
}

const HARBOUR = kitOf("harbour-lights.kit.json");
const ACME = kitOf("acme.kit.json");
const CANARY = '<img src=x onerror="window.__pwned = 1">';
const HOSTILE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><rect width="4" height="4"/></svg>';

const VALID: BrandDraft = {
  ...EMPTY_DRAFT,
  id: "acme",
  name: "Acme Rockets",
  primary: "#4f46e5",
};

const THROWING = new Proxy(
  {},
  {
    get(): never {
      throw new Error("no");
    },
    ownKeys(): never {
      throw new Error("no");
    },
    getOwnPropertyDescriptor(): never {
      throw new Error("no");
    },
    has(): never {
      throw new Error("no");
    },
  },
);

describe("hexOf", () => {
  it("writes a parsed colour's channels as #rrggbb", () => {
    expect(hexOf([79, 70, 229])).toBe("#4f46e5");
    expect(hexOf([0, 0, 0])).toBe("#000000");
    expect(hexOf([255, 255, 255])).toBe("#ffffff");
  });

  it("keeps a hex string as lower case, and nothing else", () => {
    expect(hexOf("#4F46E5")).toBe("#4f46e5");
    expect(hexOf("#ABC")).toBe("#abc");
    for (const value of [
      "red",
      "rgb(1, 2, 3)",
      "#4f46e5; background: url(https://example.com/x)",
      CANARY,
      [1, 2],
      [1, 2, 300],
      [1.5, 2, 3],
      [-1, 0, 0],
      ["1", "2", "3"],
      { 0: 1, 1: 2, 2: 3, length: 3 },
      THROWING,
      null,
      undefined,
      4,
    ]) {
      expect(hexOf(value)).toBe("");
    }
  });
});

describe("colourPickerValue", () => {
  it("gives the native colour input a #rrggbb in lower case for a valid hex, and nothing otherwise", () => {
    expect(colourPickerValue("#4F46E5")).toBe("#4f46e5");
    expect(colourPickerValue(" #abc ")).toBe("#aabbcc");
    expect(colourPickerValue("")).toBeUndefined();
    expect(colourPickerValue("#abcd")).toBeUndefined();
    expect(colourPickerValue("4f46e5")).toBeUndefined();
    expect(colourPickerValue("#4f46e5x")).toBeUndefined();
  });
});

describe("draftFromKit", () => {
  it("starts empty, with the first choices of each preset, for no kit", () => {
    expect(draftFromKit(undefined)).toEqual({ draft: EMPTY_DRAFT, refusedLogos: [] });
    expect(EMPTY_DRAFT).toMatchObject({
      id: "",
      name: "",
      tagline: "",
      primary: "",
      secondary: "",
      neutralTint: "",
      typography: "system",
      corners: "soft",
      tone: "balanced",
    });
    expect(EMPTY_DRAFT.logo).toBeUndefined();
  });

  it("reads a kit parseBrandKit returned into the form's values, logo and mark included", () => {
    const { draft, refusedLogos } = draftFromKit(HARBOUR);
    expect(refusedLogos).toEqual([]);
    expect(draft).toEqual({
      id: "harbour-lights",
      name: "Harbour Lights",
      tagline: "",
      primary: "#f4c430",
      secondary: "",
      neutralTint: "#1b2a4a",
      typography: "classic-serif",
      corners: "round",
      tone: "vivid",
      logo: HARBOUR.logo,
      mark: HARBOUR.mark,
    });
    expect(draftFromKit(ACME).draft).toMatchObject({
      tagline: "Up, up & away!",
      primary: "#4f46e5",
      secondary: "#0f766e",
    });
  });

  it("keeps markup in a string as the string, for the form to show as a value and validation to refuse", () => {
    const { draft } = draftFromKit({ ...ACME, name: `Acme ${CANARY}` });
    expect(draft.name).toBe(`Acme ${CANARY}`);
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("invalid-text");
  });

  it("drops a logo or mark that is not the sanitiser's own output, and says which", () => {
    const { draft, refusedLogos } = draftFromKit({ ...HARBOUR, logo: HOSTILE_SVG, mark: 42 });
    expect(draft.logo).toBeUndefined();
    expect(draft.mark).toBeUndefined();
    expect(refusedLogos).toEqual(["logo", "mark"]);
  });

  it("reads a proxy that throws, getters that throw and values of the wrong type as nothing, without throwing", () => {
    expect(draftFromKit(THROWING)).toEqual({ draft: EMPTY_DRAFT, refusedLogos: [] });
    const getters = Object.defineProperties(
      {},
      {
        name: {
          enumerable: true,
          get() {
            throw new Error("no");
          },
        },
        colors: {
          enumerable: true,
          get() {
            return THROWING;
          },
        },
        typography: { enumerable: true, value: 'x"; background: url(https://example.com)' },
        corners: { enumerable: true, value: ["round"] },
        tone: { enumerable: true, value: "loud" },
        id: { enumerable: true, value: 12 },
      },
    );
    expect(draftFromKit(getters).draft).toEqual(EMPTY_DRAFT);
    const inherited = Object.create({ name: "From the prototype" }) as object;
    expect(draftFromKit(inherited).draft.name).toBe("");
    expect(draftFromKit("a string").draft).toEqual(EMPTY_DRAFT);
  });

  it("reads each field once, so a getter cannot answer one thing to the check and another to the form", () => {
    const read = vi.fn(() => "Acme Rockets");
    const kit = Object.defineProperty({ ...ACME }, "name", { enumerable: true, get: read });
    expect(draftFromKit(kit).draft.name).toBe("Acme Rockets");
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("validateDraft", () => {
  it("gives the kit parseBrandKit makes of a valid draft, trimmed, with empty optional fields left out", () => {
    const result = validateDraft({ ...VALID, name: "  Acme Rockets ", primary: " #4F46E5" });
    if (!result.ok) throw new Error("not valid");
    expect(result.kit).toEqual({
      id: "acme",
      name: "Acme Rockets",
      colors: { primary: [79, 70, 229] },
      typography: "system",
      corners: "soft",
      tone: "balanced",
    });
  });

  it("names the first error of each field by the code parseBrandKit gave", () => {
    const result = validateDraft({
      ...EMPTY_DRAFT,
      id: "Not An Id",
      name: "",
      tagline: "x".repeat(121),
      primary: "red",
      secondary: "#12345",
      neutralTint: "#gggggg",
      typography: "comic",
      corners: "jagged",
      tone: "loud",
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        id: "invalid-id",
        name: "missing",
        tagline: "too-long",
        primary: "invalid-color",
        secondary: "invalid-color",
        neutralTint: "invalid-color",
        typography: "not-allowed",
        corners: "not-allowed",
        tone: "not-allowed",
      },
    });
  });

  it("refuses a reserved id and an empty primary", () => {
    const result = validateDraft({ ...VALID, id: "dark", primary: "" });
    expect(result).toEqual({ ok: false, errors: { id: "reserved-id", primary: "missing" } });
  });

  it("validates the logo and mark too", () => {
    const upload = sanitiseSvgLogo(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="1" height="1"/></svg>',
    );
    if (!upload.ok) throw new Error("not a logo");
    expect(validateDraft({ ...VALID, logo: upload.svg, mark: upload.svg }).ok).toBe(true);
    expect(validateDraft({ ...VALID, logo: HOSTILE_SVG })).toEqual({
      ok: false,
      errors: { logo: "unsanitised-logo" },
    });
  });
});

describe("previewOf", () => {
  it("gives the kit without its logo and mark and the theme generated from it", () => {
    const preview = previewOf(draftFromKit(HARBOUR).draft);
    expect(preview?.kit.logo).toBeUndefined();
    expect(preview?.kit.mark).toBeUndefined();
    expect(preview?.kit.name).toBe("Harbour Lights");
    expect(preview?.theme.id).toBe("harbour-lights");
    expect(preview?.theme.document.light.color.accent).toEqual({ $value: "#f4c430" });
  });

  it("gives nothing for a draft that is not a kit", () => {
    expect(previewOf(EMPTY_DRAFT)).toBeUndefined();
    expect(previewOf({ ...VALID, primary: "red" })).toBeUndefined();
  });

  it("never reads the logo or mark, whatever they hold", () => {
    const logo = { toString: vi.fn(() => HOSTILE_SVG) } as unknown as string;
    expect(previewOf({ ...VALID, logo, mark: logo })?.kit.name).toBe("Acme Rockets");
    expect(logo.toString).not.toHaveBeenCalled();
  });
});
