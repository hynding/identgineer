import { describe, expect, it } from "vitest";
import { formatValue } from "./emit-css.ts";
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
