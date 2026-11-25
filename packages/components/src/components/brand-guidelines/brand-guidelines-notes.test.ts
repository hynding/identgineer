import { readFileSync } from "node:fs";
import { generateBrandTheme, parseBrandKit, type BrandTheme } from "@identgineer/brand";
import { describe, expect, it } from "vitest";
import { readAdjustments, readNotes } from "./brand-guidelines-notes";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);

function themeOf(file: string): BrandTheme {
  const result = parseBrandKit(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")));
  if (!result.ok) throw new Error(`${file} is not a kit`);
  return generateBrandTheme(result.kit);
}

const HARBOUR = themeOf("harbour-lights.kit.json");
const ACME = themeOf("acme.kit.json");

const NOTE = {
  scheme: "light",
  kind: "status-near-accent",
  token: "color.warning",
  against: "color.accent",
  distance: 0.05,
};
const BLEND = {
  scheme: "dark",
  kind: "accent-blends-with-page",
  token: "color.accent",
  against: "color.bg",
  contrast: 1.2,
};
const ADJUSTMENT = {
  scheme: "light",
  token: "color.link",
  origin: "primary",
  requested: "#f4c430",
  used: "#7e6200",
  against: "color.accent-subtle",
  minimum: 4.5,
  contrastBefore: 1.28,
  contrastAfter: 4.5039,
};
const THROWING = new Proxy(
  {},
  {
    get(): never {
      throw new Error("no");
    },
  },
);

describe("the notes of a theme", () => {
  it("are what the generator left alone, each with the role and what it was measured against", () => {
    expect(readNotes(HARBOUR)).toEqual({
      items: [
        {
          kind: "status-near-accent",
          scheme: "light",
          role: "warning",
          against: "accent",
          figure:
            HARBOUR.notes[0] && "distance" in HARBOUR.notes[0] ? HARBOUR.notes[0].distance : -1,
        },
        expect.objectContaining({ kind: "status-near-accent", scheme: "dark", role: "warning" }),
      ],
      omitted: 0,
    });
  });

  it("are an empty list for a theme with none, and nothing for a document that carries none", () => {
    expect(readNotes(ACME)).toEqual({ items: [], omitted: 0 });
    expect(readNotes(ACME.document)).toBeUndefined();
    expect(readNotes({ document: ACME.document })).toBeUndefined();
  });

  it("read an accent that blends with the page by its contrast", () => {
    expect(readNotes({ notes: [BLEND] })).toEqual({
      items: [
        {
          kind: "accent-blends-with-page",
          scheme: "dark",
          role: "accent",
          against: "bg",
          figure: 1.2,
        },
      ],
      omitted: 0,
    });
  });

  it.each([
    ["a scheme that is neither", { ...NOTE, scheme: "sepia" }],
    ["a kind it does not know", { ...NOTE, kind: "other" }],
    ["a role that is not a colour token", { ...NOTE, token: "color.x; y" }],
    ["a role of another group", { ...NOTE, token: "font.size" }],
    ["a target that is not a colour token", { ...NOTE, against: "<b>" }],
    ["a distance that is not finite", { ...NOTE, distance: Number.NaN }],
    ["a distance that is a string", { ...NOTE, distance: "0.05" }],
    ["a distance below zero", { ...NOTE, distance: -1 }],
    ["a distance above any OKLab distance", { ...NOTE, distance: 5 }],
    ["a contrast below 1", { ...BLEND, contrast: 0.5 }],
    ["a contrast above 21", { ...BLEND, contrast: 22 }],
    ["not an object", "note"],
    ["null", null],
    ["a throwing proxy", THROWING],
  ])("leave out a note with %s, and keep the others", (_name, bad) => {
    expect(readNotes({ notes: [bad, NOTE] })?.items).toHaveLength(1);
  });

  it("list at most fifty and say how many more there are", () => {
    const list = readNotes({ notes: Array.from({ length: 70 }, () => NOTE) });
    expect(list?.items).toHaveLength(50);
    expect(list?.omitted).toBe(20);
  });

  it("count no more than they read when the array claims a length that is no number of entries", () => {
    const claims = new Proxy([NOTE], {
      get: (target, key) => (key === "length" ? 1e300 : Reflect.get(target, key)),
    });
    const list = readNotes({ notes: claims });
    expect(Number.isSafeInteger(list?.omitted)).toBe(true);
    expect(list?.omitted).toBe(0);
  });

  it("are nothing for notes that are not an array, or a theme whose reads throw", () => {
    for (const theme of [
      undefined,
      null,
      "theme",
      {},
      { notes: "x" },
      { notes: { length: 1 } },
      THROWING,
    ]) {
      expect(readNotes(theme)).toBeUndefined();
    }
  });
});

describe("the adjustments of a theme", () => {
  it("are every colour the generator moved, with where it started, where it ended and what it was held to", () => {
    const list = readAdjustments(HARBOUR);
    expect(list?.omitted).toBe(0);
    expect(list?.items).toHaveLength(HARBOUR.adjustments.length);
    expect(list?.items[0]).toEqual({
      scheme: "light",
      role: "accent-indicator",
      origin: "primary",
      requested: "#f4c430",
      used: "#a07d00",
      against: "accent-subtle",
      minimum: 3,
      before: HARBOUR.adjustments[0]?.contrastBefore,
      after: HARBOUR.adjustments[0]?.contrastAfter,
    });
  });

  it("are nothing for a document that carries none", () => {
    expect(readAdjustments(ACME.document)).toBeUndefined();
  });

  it.each([
    ["a requested colour that is not hex", { ...ADJUSTMENT, requested: "red" }],
    ["a used colour with a declaration after it", { ...ADJUSTMENT, used: "#7e6200; x: y" }],
    ["an upper case colour", { ...ADJUSTMENT, used: "#7E6200" }],
    ["an origin it does not know", { ...ADJUSTMENT, origin: "user" }],
    ["a scheme it does not know", { ...ADJUSTMENT, scheme: "x" }],
    ["a role with markup", { ...ADJUSTMENT, token: "color.<img>" }],
    ["a minimum that is NaN", { ...ADJUSTMENT, minimum: Number.NaN }],
    ["a minimum above 21", { ...ADJUSTMENT, minimum: 30 }],
    ["a contrast before that is a string", { ...ADJUSTMENT, contrastBefore: "1" }],
    [
      "a contrast after that is infinite",
      { ...ADJUSTMENT, contrastAfter: Number.POSITIVE_INFINITY },
    ],
    ["a contrast after below 1", { ...ADJUSTMENT, contrastAfter: 0 }],
    ["not an object", 3],
    ["a throwing proxy", THROWING],
  ])("leave out an adjustment with %s, and keep the others", (_name, bad) => {
    expect(readAdjustments({ adjustments: [bad, ADJUSTMENT] })?.items).toHaveLength(1);
  });

  it("list at most fifty and say how many more there are", () => {
    const list = readAdjustments({ adjustments: Array.from({ length: 53 }, () => ADJUSTMENT) });
    expect(list?.items).toHaveLength(50);
    expect(list?.omitted).toBe(3);
  });

  it("count a malformed one among those left out, not among those omitted", () => {
    const list = readAdjustments({ adjustments: [ADJUSTMENT, "x", ADJUSTMENT] });
    expect(list).toEqual({ items: [expect.any(Object), expect.any(Object)], omitted: 0 });
  });
});
