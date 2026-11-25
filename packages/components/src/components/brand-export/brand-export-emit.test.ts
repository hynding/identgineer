import { readFileSync } from "node:fs";
import {
  emitBrandThemeCss,
  emitBrandThemeTokens,
  generateBrandTheme,
  parseBrandKit,
  type BrandTheme,
} from "@identgineer/brand";
import { describe, expect, it } from "vitest";
import { emitTheme } from "./brand-export-emit";

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
    });
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
