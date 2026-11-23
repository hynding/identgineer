import { describe, expect, it } from "vitest";
import { attributeSelector, emitThemeCss, formatValue } from "./emit-css.ts";
import type { ResolvedToken } from "./token-types.ts";

function fontFamilyToken(names: readonly string[]): ResolvedToken {
  return {
    path: "font.family.body",
    type: "fontFamily",
    value: names,
    description: undefined,
    source: "tokens/example.json",
  };
}

describe("formatValue", () => {
  it("quotes font names that contain spaces and leaves keywords bare", () => {
    expect(formatValue(fontFamilyToken(["Iowan Old Style", "serif"]))).toBe(
      '"Iowan Old Style", serif',
    );
  });

  it.each(['Evil"; } body { display: none', "Back\\slash", "Line\nbreak"])(
    "refuses a font name that could escape its quotes: %j",
    (name) => {
      expect(() => formatValue(fontFamilyToken([name]))).toThrow(
        'tokens/example.json: token "font.family.body" has an unsafe font name',
      );
    },
  );
});

function colorToken(path: string, value: string): ResolvedToken {
  return { path, type: "color", value, description: undefined, source: "tokens/example.json" };
}

describe("attributeSelector", () => {
  it("leaves a plain id as it is", () => {
    expect(attributeSelector("data-theme", "acme-co")).toBe('[data-theme="acme-co"]');
  });

  it.each([
    ['a"b', '[data-theme="a\\"b"]'],
    ["a\\b", '[data-theme="a\\\\b"]'],
    ["a\nb", '[data-theme="a\\a b"]'],
    ["a\u0000b", '[data-theme="a\ufffdb"]'],
    ["a\u007fb", '[data-theme="a\\7f b"]'],
    ['x"] body { display: none } [a="', '[data-theme="x\\"] body { display: none } [a=\\""]'],
  ])("escapes %j so it cannot leave the quoted value", (value, expected) => {
    expect(attributeSelector("data-theme", value)).toBe(expected);
  });
});

describe("emitThemeCss", () => {
  it("writes the theme id through attributeSelector, so no id can end the selector", () => {
    const css = emitThemeCss({
      id: 'x"] , body {',
      isDefault: false,
      light: [colorToken("color.bg", "#ffffff")],
      dark: [colorToken("color.bg", "#000000")],
    });
    expect(css).toContain('[data-theme="x\\"] , body {"] {');
    expect(css).not.toContain('[data-theme="x"]');
  });
});
