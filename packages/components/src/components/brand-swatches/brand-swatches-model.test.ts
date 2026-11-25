import { readFileSync } from "node:fs";
import { generateBrandTheme, parseBrandKit, type BrandTheme } from "@identgineer/brand";
import { contrastRatio } from "@identgineer/tokens/contrast";
import { CONTRAST_PAIRS } from "@identgineer/tokens/theme-pipeline";
import { describe, expect, it } from "vitest";
import {
  buildSwatchGroups,
  contrastText,
  readSwatchColours,
  type SwatchGroup,
} from "./brand-swatches-model";
import { SWATCH_GROUPS, SWATCH_PAIRS } from "./brand-swatches-roles";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);

function themeOf(file: string): BrandTheme {
  const result = parseBrandKit(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")));
  if (!result.ok) throw new Error(`${file} is not a kit`);
  return generateBrandTheme(result.kit);
}

const THEMES = [themeOf("acme.kit.json"), themeOf("harbour-lights.kit.json")];
const ACME = themeOf("acme.kit.json");

function documentValue(theme: BrandTheme, scheme: "light" | "dark", role: string): unknown {
  const token = theme.document[scheme].color[role];
  return typeof token === "object" ? token.$value : undefined;
}

const roles = (groups: readonly SwatchGroup[]) =>
  groups.flatMap((group) => group.swatches.map((swatch) => swatch.role));

describe("readSwatchColours", () => {
  it("reads the colours of both schemes from a generated theme", () => {
    const colours = readSwatchColours(ACME);
    for (const scheme of ["light", "dark"] as const) {
      const map = colours[scheme];
      expect(map.size).toBe(SWATCH_GROUPS.flatMap((group) => group.roles).length);
      expect(map.get("accent")).toBe("#4f46e5");
      for (const value of map.values()) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("reads the theme document, the palette part of a theme, as well", () => {
    expect(readSwatchColours(ACME.document)).toEqual(readSwatchColours(ACME));
  });

  it("gives each scheme the colours of its own scheme", () => {
    const colours = readSwatchColours(ACME);
    expect(colours.light.get("bg")).not.toBe(colours.dark.get("bg"));
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a string", "#ffffff"],
    ["a number", 7],
    ["an array", []],
    ["an object with no schemes", {}],
    ["a scheme with no colours", { light: {}, dark: { color: null } }],
  ])("reads no colour from %s", (_name, theme) => {
    const colours = readSwatchColours(theme);
    expect(colours.light.size).toBe(0);
    expect(colours.dark.size).toBe(0);
  });

  it.each([
    ["a named colour", "red"],
    ["a short hex", "#fff"],
    ["an upper case hex", "#FFFFFF"],
    ["a hex with an alpha channel", "#ffffff80"],
    ["rgb()", "rgb(255, 255, 255)"],
    ["a custom property", "var(--idg-color-bg)"],
    ["a declaration smuggled after a colour", "#ffffff; background: url(https://example.com/x)"],
    ["a colour with a line break", "#ffffff\n"],
    ["a colour with a space", " #ffffff"],
    ["markup", "<img src=x onerror=alert(1)>"],
    ["a number", 16777215],
    ["an object", { toString: () => "#ffffff" }],
    ["nothing", undefined],
  ])("leaves out a colour that is %s, and nothing else", (_name, value) => {
    const hostile = {
      light: { color: { ...ACME.document.light.color, text: { $value: value } } },
      dark: ACME.document.dark,
    };
    const colours = readSwatchColours(hostile);
    expect(colours.light.has("text")).toBe(false);
    expect(colours.light.size).toBe(colours.dark.size - 1);
  });

  it("reads only the roles it knows, never a key the theme brings", () => {
    const palette = {
      light: {
        color: {
          bg: { $value: "#ffffff" },
          "not-a-role": { $value: "#000000" },
          constructor: { $value: "#000000" },
          ["__proto__"]: { $value: "#000000" },
        },
      },
      dark: { color: {} },
    };
    expect([...readSwatchColours(palette).light.keys()]).toEqual(["bg"]);
  });

  it("does not read through the prototype", () => {
    const light = Object.create({ bg: { $value: "#ffffff" } }) as object;
    expect(readSwatchColours({ light: { color: light }, dark: { color: {} } }).light.size).toBe(0);
  });

  it("gives nothing for a theme whose getter throws or whose proxy is revoked", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(readSwatchColours(proxy).light.size).toBe(0);
    const throwing = {
      get light(): never {
        throw new Error("no");
      },
    };
    expect(readSwatchColours(throwing).light.size).toBe(0);
  });
});

describe("the roles shown", () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))(
    "are exactly the colour roles of the generated theme %s, each once",
    (_id, theme) => {
      const generated = Object.keys(theme.document.light.color).filter((key) => key !== "$type");
      const shown = SWATCH_GROUPS.flatMap((group) => group.roles);
      expect([...shown].sort()).toEqual([...generated].sort());
      expect(new Set(shown).size).toBe(shown.length);
    },
  );

  it("cover every pair the tokens package requires of a theme, at least as strictly", () => {
    for (const required of CONTRAST_PAIRS) {
      const shown = SWATCH_PAIRS.find(
        (pair) =>
          pair.foreground === required.foreground && pair.background === required.background,
      );
      expect(shown, `${required.foreground} on ${required.background}`).toBeDefined();
      expect(shown?.minimum).toBeGreaterThanOrEqual(required.minimum);
    }
  });
});

describe("buildSwatchGroups", () => {
  it.each(THEMES.map((theme) => [theme.id, theme] as const))(
    "gives the value of every role of %s as the theme holds it",
    (_id, theme) => {
      const colours = readSwatchColours(theme);
      for (const scheme of ["light", "dark"] as const) {
        const groups = buildSwatchGroups(colours[scheme]);
        for (const swatch of groups.flatMap((group) => group.swatches)) {
          expect(swatch.value).toBe(documentValue(theme, scheme, swatch.role));
        }
      }
    },
  );

  it.each(THEMES.map((theme) => [theme.id, theme] as const))(
    "gives every pair of %s its contrast, as the tokens package measures it, and each passes",
    (_id, theme) => {
      const colours = readSwatchColours(theme);
      for (const scheme of ["light", "dark"] as const) {
        const map = colours[scheme];
        const pairs = buildSwatchGroups(map).flatMap((group) =>
          group.swatches.flatMap((swatch) => swatch.pairs.map((pair) => ({ swatch, pair }))),
        );
        expect(pairs).toHaveLength(SWATCH_PAIRS.length);
        for (const { swatch, pair } of pairs) {
          const foreground = map.get(swatch.role) ?? "";
          const background = map.get(pair.background) ?? "";
          expect(pair.ratio).toBe(contrastRatio(foreground, background));
          expect(pair.passes, `${scheme} ${swatch.role} on ${pair.background}`).toBe(true);
        }
      }
    },
  );

  it("puts a pair on the row of its foreground, and keeps the order of the groups", () => {
    const groups = buildSwatchGroups(readSwatchColours(ACME).light);
    expect(groups.map((group) => group.id)).toEqual(SWATCH_GROUPS.map((group) => group.id));
    const text = groups.flatMap((group) => group.swatches).find((swatch) => swatch.role === "text");
    expect(text?.pairs.map((pair) => pair.background)).toContain("bg");
    const background = groups
      .flatMap((group) => group.swatches)
      .find((swatch) => swatch.role === "bg");
    expect(background?.pairs).toEqual([]);
  });

  it("says a pair fails when it is below its minimum", () => {
    const colours = new Map([
      ["text", "#777777"],
      ["bg", "#808080"],
    ]);
    const swatch = buildSwatchGroups(colours)
      .flatMap((group) => group.swatches)
      .find((candidate) => candidate.role === "text");
    expect(swatch?.pairs).toHaveLength(1);
    expect(swatch?.pairs[0]).toMatchObject({ background: "bg", minimum: 4.5, passes: false });
    expect(swatch?.pairs[0]?.ratio).toBeLessThan(4.5);
  });

  it("leaves out a pair whose other colour is missing, and a role with no colour", () => {
    const groups = buildSwatchGroups(new Map([["text", "#000000"]]));
    expect(roles(groups)).toEqual(["text"]);
    expect(groups.flatMap((group) => group.swatches.flatMap((swatch) => swatch.pairs))).toEqual([]);
  });

  it("leaves out a group with no colour", () => {
    expect(buildSwatchGroups(new Map()).length).toBe(0);
  });
});

describe("contrastText", () => {
  it("rounds down to two decimals, so a ratio below its minimum is never shown as meeting it", () => {
    const format = (value: number) => String(value);
    expect(contrastText(4.496, format)).toBe("4.49");
    expect(contrastText(4.5, format)).toBe("4.5");
    expect(contrastText(21, format)).toBe("21");
    expect(contrastText(1, format)).toBe("1");
  });
});
