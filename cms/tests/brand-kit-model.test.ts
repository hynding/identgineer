import { describe, expect, it } from "vitest";
import {
  BRAND_ID_MAX_LENGTH,
  BRAND_ID_MIN_LENGTH,
  CORNERS,
  NAME_MAX_LENGTH,
  parseBrandKit,
  SVG_LOGO_LIMITS,
  TAGLINE_MAX_LENGTH,
  TONES,
  TYPOGRAPHY_IDS,
} from "../../packages/brand/src/index.ts";
import { ADDED_THEME_ID_RULE } from "../../packages/tokens/src/index.ts";
import { contentTypeNamed, loadIr, type Field } from "./model";

// The CMS stores the brand kit of @identgineer/brand. These checks fail when the model drifts from
// the package: a value the package writes that the CMS would refuse, or a choice the CMS offers
// that the package cannot read.

const ir = loadIr();
const brandKit = contentTypeNamed(ir, "BrandKit");

const fieldOf = (name: string): Field => {
  const field = brandKit.fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`BrandKit has no "${name}" field`);
  return field;
};

const matcher = (name: string): RegExp => {
  const { pattern } = fieldOf(name);
  if (pattern === undefined) throw new Error(`BrandKit.${name} has no pattern`);
  return new RegExp(pattern);
};

/** A letter outside the Basic Multilingual Plane: one code point, two UTF-16 units. */
const WIDE_LETTER = "\u{20000}";

const kitWith = (fields: Record<string, unknown>) =>
  parseBrandKit({
    id: "acme",
    name: "Acme",
    colors: { primary: "#4f46e5" },
    typography: "system",
    corners: "soft",
    tone: "balanced",
    ...fields,
  });

describe("the BrandKit content type", () => {
  it("holds exactly the kit's fields, its owner and whether it is public", () => {
    expect(brandKit.fields.map((f) => f.name).sort()).toEqual(
      [
        "owner",
        "brandId",
        "name",
        "tagline",
        "primaryColor",
        "secondaryColor",
        "neutralTint",
        "typography",
        "corners",
        "tone",
        "logo",
        "mark",
        "isPublic",
      ].sort(),
    );
  });

  it("stores no derived theme, which the server cannot verify", () => {
    expect(brandKit.fields.filter((f) => f.type === "json")).toEqual([]);
  });

  it("has no component left from the old type pairing", () => {
    expect(ir.components.map((c) => c.name)).not.toContain("TypePairing");
  });

  it("is private unless its owner makes it public", () => {
    expect(fieldOf("isPublic")).toMatchObject({ type: "boolean", default: false });
  });
});

describe("the brand id", () => {
  it("is a required string with the package's lengths and the tokens package's pattern", () => {
    expect(fieldOf("brandId")).toMatchObject({
      type: "string",
      required: true,
      minLength: BRAND_ID_MIN_LENGTH,
      maxLength: BRAND_ID_MAX_LENGTH,
      pattern: ADDED_THEME_ID_RULE.pattern,
    });
  });

  it("is not unique, so taking an id tells nobody which ids other users chose", () => {
    expect(fieldOf("brandId").unique).toBeUndefined();
  });
});

describe("the name and tagline", () => {
  it.each([
    ["name", NAME_MAX_LENGTH, true],
    ["tagline", TAGLINE_MAX_LENGTH, false],
  ] as const)(
    "%s is a string that takes every value the package accepts",
    (name, codePoints, required) => {
      const field = fieldOf(name);
      expect(field.type).toBe("string");
      expect(field.required === true).toBe(required);
      // The package counts code points; Strapi counts UTF-16 units, so the longest value the
      // package accepts can be twice as long there.
      const longest = WIDE_LETTER.repeat(codePoints);
      const result = kitWith({ [name]: longest });
      expect(result.ok).toBe(true);
      expect(field.maxLength).toBe(longest.length);
    },
  );
});

describe("the colours", () => {
  it.each(["primaryColor", "secondaryColor", "neutralTint"])("%s is a #rrggbb colour", (name) => {
    expect(fieldOf(name).type).toBe("color");
    const pattern = matcher(name);
    expect(pattern.test("#4f46e5")).toBe(true);
    expect(pattern.test("#4F46E5")).toBe(true);
    expect(pattern.test("#fff")).toBe(false);
    expect(pattern.test("red")).toBe(false);
    expect(pattern.test("#4f46e5;")).toBe(false);
  });

  it("requires the primary colour only", () => {
    expect(fieldOf("primaryColor").required).toBe(true);
    expect(fieldOf("secondaryColor").required).toBeUndefined();
    expect(fieldOf("neutralTint").required).toBeUndefined();
  });

  it("reads back every colour it stores as a colour the package accepts", () => {
    const result = kitWith({
      colors: { primary: "#4F46E5", secondary: "#000000", neutralTint: "#ffffff" },
    });
    expect(result.ok).toBe(true);
  });
});

describe("the choices", () => {
  it.each([
    ["typography", TYPOGRAPHY_IDS],
    ["corners", CORNERS],
    ["tone", TONES],
  ] as const)("%s offers exactly the package's values and is required", (name, values) => {
    expect(fieldOf(name)).toMatchObject({ type: "enumeration", required: true });
    expect(fieldOf(name).values).toEqual([...values]);
    // The package has no default for a choice, so neither has the CMS.
    expect(fieldOf(name).default).toBeUndefined();
  });
});

describe("the logo and mark", () => {
  it.each(["logo", "mark"])(
    "%s is long text bounded by the sanitiser's output limit, not a media field",
    (name) => {
      const field = fieldOf(name);
      expect(field.type).toBe("text");
      expect(field.required).toBeUndefined();
      // The sanitiser never writes more than SVG_LOGO_LIMITS.inputBytes UTF-8 bytes, and a string
      // never has more code points or UTF-16 units than UTF-8 bytes.
      expect(field.maxLength).toBe(SVG_LOGO_LIMITS.inputBytes);
    },
  );

  it("keeps every SVG out of the media library", () => {
    expect(brandKit.fields.filter((f) => f.type === "media")).toEqual([]);
  });
});
