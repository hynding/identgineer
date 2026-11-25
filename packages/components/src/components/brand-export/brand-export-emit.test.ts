import { readFileSync } from "node:fs";
import {
  emitBrandThemeCss,
  emitBrandThemeTokens,
  generateBrandTheme,
  parseBrandKit,
  type BrandTheme,
} from "@identgineer/brand";
import { describe, expect, it } from "vitest";
import { emitFailure, emitTheme } from "./brand-export-emit";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);
const result = parseBrandKit(
  JSON.parse(readFileSync(new URL("harbour-lights.kit.json", FIXTURES), "utf8")),
);
if (!result.ok) throw new Error("the fixture kit is not a kit");
const THEME: BrandTheme = generateBrandTheme(result.kit);

describe("emitTheme", () => {
  it("gives the stylesheet and the token source the brand package's own emitters write", () => {
    expect(emitTheme(THEME)).toEqual({
      css: emitBrandThemeCss(THEME),
      tokens: emitBrandThemeTokens(THEME),
      id: THEME.id,
    });
  });

  it("emits both texts from one reading of the theme, whatever its getters say afterwards", () => {
    let reads = 0;
    const switching = {
      get id() {
        reads += 1;
        return reads === 1 ? THEME.id : "other-theme";
      },
      get kit() {
        return THEME.kit;
      },
      get document() {
        return THEME.document;
      },
      get radius() {
        return THEME.radius;
      },
    };
    const emitted = emitTheme(switching);
    expect(emitted?.id).toBe(THEME.id);
    expect(emitted?.css).toBe(emitBrandThemeCss(THEME));
    expect(emitted?.tokens).toBe(emitBrandThemeTokens(THEME));
    expect(emitted?.css).not.toContain("other-theme");
  });

  it("gives a stylesheet and tokens of one theme when nested values change between reads", () => {
    const other = parseBrandKit({
      id: "kilnworks",
      name: "Kilnworks",
      colors: { primary: "#c2410c" },
      typography: "system",
      corners: "sharp",
      tone: "vivid",
    });
    if (!other.ok) throw new Error("expected a kit");
    const OTHER = generateBrandTheme(other.kit);
    let colourReads = 0;
    let documentReads = 0;
    const kit = { ...THEME.kit };
    Object.defineProperty(kit, "colors", {
      enumerable: true,
      get: () => (colourReads++ < 1 ? THEME.kit : OTHER.kit).colors,
    });
    const document = { toJSON: () => (documentReads++ < 1 ? THEME.document : OTHER.document) };
    const emitted = emitTheme({ ...THEME, kit, document });
    expect(emitted?.css).toBe(emitBrandThemeCss(THEME));
    expect(emitted?.tokens).toBe(emitBrandThemeTokens(THEME));
  });

  it("tells a theme that has no kit from one that no longer matches it", () => {
    expect(emitTheme({ ...THEME, kit: undefined })).toBeUndefined();
    expect(emitFailure({ ...THEME, kit: undefined })).toBe("no-kit");
    expect(emitFailure({ ...THEME, radius: { ...THEME.radius, sm: "1px" } })).toBe("altered");
  });

  it("gives nothing for a theme altered after it was generated", () => {
    const altered = {
      ...THEME,
      document: { ...THEME.document, $description: "changed" },
    };
    expect(emitTheme(altered)).toBeUndefined();
    expect(emitTheme({ ...THEME, radius: { ...THEME.radius, sm: "1px; x: y" } })).toBeUndefined();
  });

  it("gives nothing for a kit that is not one", () => {
    expect(emitTheme({ ...THEME, kit: { ...THEME.kit, id: "Not An Id" } })).toBeUndefined();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "theme"],
    ["a number", 3],
    ["an empty object", {}],
    ["an array", []],
    [
      "a revoked proxy",
      (() => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        return proxy;
      })(),
    ],
    [
      "a throwing getter",
      {
        get kit(): never {
          throw new Error("no");
        },
      },
    ],
  ])("gives nothing for %s, and does not throw", (_name, theme) => {
    expect(emitTheme(theme)).toBeUndefined();
  });
});
