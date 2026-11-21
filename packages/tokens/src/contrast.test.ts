import { describe, expect, it } from "vitest";
import { contrastRatio, parseHexColor, relativeLuminance } from "./contrast.ts";

describe("parseHexColor", () => {
  it("parses six digit hex", () => {
    expect(parseHexColor("#ff8000")).toEqual([255, 128, 0]);
  });

  it.each(["fff", "#fff", "#12345", "#gggggg", "rgb(0,0,0)", "#11223344"])(
    "rejects %s with a located message",
    (input) => {
      expect(() => parseHexColor(input, 'token "color.bg" in a.json')).toThrow(
        `invalid colour "${input}" for token "color.bg" in a.json: expected #rrggbb`,
      );
    },
  );
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
  });

  it("applies the WCAG sRGB transfer function", () => {
    // 0x80 -> 128/255 = 0.50196; ((0.50196 + 0.055) / 1.055)^2.4 = 0.21586
    expect(relativeLuminance("#808080")).toBeCloseTo(0.21586, 5);
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126, 5);
    expect(relativeLuminance("#00ff00")).toBeCloseTo(0.7152, 5);
    expect(relativeLuminance("#0000ff")).toBeCloseTo(0.0722, 5);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 10);
  });

  it("is 1 for identical colours", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 10);
  });

  it("matches published WCAG reference values", () => {
    // #767676 on white is the well known lightest grey that passes 4.5:1.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
