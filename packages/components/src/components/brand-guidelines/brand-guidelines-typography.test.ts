import { FONT_PAIRINGS } from "@identgineer/brand/presets";
import { describe, expect, it } from "vitest";
import { readTypography } from "./brand-guidelines-typography";

describe("the typography of a kit", () => {
  it.each(FONT_PAIRINGS.map((pairing) => [pairing.id, pairing] as const))(
    "is the whole of the font pairing %s, every family kept",
    (id, pairing) => {
      const typography = readTypography({ typography: id });
      expect(typography?.label).toBe(pairing.label);
      expect(typography?.heading.families).toEqual(pairing.display);
      expect(typography?.body.families).toEqual(pairing.body);
      expect(typography?.heading.weight).toBe(pairing.displayWeight);
      expect(typography?.heading.letterSpacing).toBe(pairing.displayLetterSpacing);
      expect(typography?.heading.lineHeight).toBe(pairing.displayLineHeight);
      expect(typography?.body.weight).toBeUndefined();
      expect(typography?.body.letterSpacing).toBe(pairing.bodyLetterSpacing);
      expect(typography?.body.lineHeight).toBe(pairing.bodyLineHeight);
    },
  );

  it("writes each stack with a name that has a space in quotes and a generic family bare", () => {
    expect(readTypography({ typography: "classic-serif" })?.heading.stack).toBe(
      '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    );
    expect(readTypography({ typography: "system" })?.body.stack).toBe(
      'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    );
  });

  it("writes stacks of nothing but names, quotes, commas and spaces", () => {
    for (const { id } of FONT_PAIRINGS) {
      const typography = readTypography({ typography: id });
      for (const face of [typography?.heading, typography?.body]) {
        expect(face?.stack).toMatch(
          /^(?:"[A-Za-z0-9 _-]+"|[A-Za-z0-9_-]+)(?:, (?:"[A-Za-z0-9 _-]+"|[A-Za-z0-9_-]+))*$/,
        );
      }
    }
  });

  it.each([
    ["an id that is not a pairing", "comic-sans"],
    ["a font stack of its own", '"x"; background: url(https://example.com/f)'],
    ["a prototype name", "constructor"],
    ["a number", 3],
    ["nothing", undefined],
    ["an object", { id: "system" }],
  ])("is nothing for %s", (_name, typography) => {
    expect(readTypography({ typography })).toBeUndefined();
  });

  it("is nothing for a kit that is not an object or whose reads throw", () => {
    const throwing = new Proxy(
      {},
      {
        get(): never {
          throw new Error("no");
        },
      },
    );
    for (const kit of [undefined, null, "system", throwing]) {
      expect(readTypography(kit)).toBeUndefined();
    }
  });
});
