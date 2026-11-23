import { describe, expect, it } from "vitest";
import { formatHexColor, parseHexColor } from "./srgb.ts";
import { fromOklch, isInSrgbGamut, mapToSrgbGamut, toOklab, toOklch } from "./oklch.ts";
import type { Rgb } from "./srgb.ts";

function rgb(hex: string): Rgb {
  const parsed = parseHexColor(hex);
  if (!parsed) throw new Error(`bad test colour ${hex}`);
  return parsed;
}

// Reference values: Björn Ottosson's OKLab definition and the CSS Color 4 sample conversions.
describe("toOklab", () => {
  it.each([
    ["#ffffff", 1, 0, 0],
    ["#000000", 0, 0, 0],
    ["#ff0000", 0.627955, 0.224863, 0.125846],
    ["#00ff00", 0.86644, -0.233888, 0.179498],
    ["#0000ff", 0.452014, -0.032457, -0.311528],
    ["#808080", 0.599871, 0, 0],
  ])("converts %s", (hex, lightness, a, b) => {
    const lab = toOklab(rgb(hex));
    expect(lab.lightness).toBeCloseTo(lightness, 4);
    expect(lab.a).toBeCloseTo(a, 4);
    expect(lab.b).toBeCloseTo(b, 4);
  });
});

describe("toOklch", () => {
  it.each([
    ["#ff0000", 0.627955, 0.257683, 29.2339],
    ["#00ff00", 0.86644, 0.294827, 142.4953],
    ["#0000ff", 0.452014, 0.313214, 264.052],
    ["#ffff00", 0.967983, 0.211006, 109.7692],
  ])("converts %s to lightness, chroma and hue in degrees", (hex, lightness, chroma, hue) => {
    const lch = toOklch(rgb(hex));
    expect(lch.lightness).toBeCloseTo(lightness, 4);
    expect(lch.chroma).toBeCloseTo(chroma, 4);
    expect(lch.hue).toBeCloseTo(hue, 2);
  });

  it("gives a grey a chroma of zero and a hue of zero", () => {
    const lch = toOklch(rgb("#777777"));
    expect(lch.chroma).toBeLessThan(1e-6);
    expect(lch.hue).toBe(0);
  });

  it("keeps hue within [0, 360)", () => {
    expect(toOklch(rgb("#ff00ff")).hue).toBeGreaterThanOrEqual(0);
    expect(toOklch(rgb("#ff0080")).hue).toBeLessThan(360);
  });
});

describe("fromOklch", () => {
  it("round-trips every #rgb colour exactly", () => {
    for (let value = 0; value < 4096; value += 1) {
      const hex = `#${[8, 4, 0].map((shift) => ((value >> shift) & 15).toString(16).repeat(2)).join("")}`;
      expect(formatHexColor(fromOklch(toOklch(rgb(hex))))).toBe(hex);
    }
  });

  it("returns integer channels within 0..255 even far outside the gamut", () => {
    for (const color of [
      { lightness: 0.7, chroma: 0.5, hue: 145 },
      { lightness: 1.2, chroma: 0.1, hue: 20 },
      { lightness: -0.1, chroma: 0.1, hue: 20 },
      { lightness: 0.5, chroma: 2, hue: 300 },
    ]) {
      for (const channel of fromOklch(color)) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("mapToSrgbGamut", () => {
  it("leaves a colour that is already in gamut alone", () => {
    const inside = { lightness: 0.6, chroma: 0.05, hue: 200 };
    expect(isInSrgbGamut(inside)).toBe(true);
    expect(mapToSrgbGamut(inside)).toEqual(inside);
  });

  it("reduces only chroma, to just inside the gamut, keeping lightness and hue", () => {
    const outside = { lightness: 0.7, chroma: 0.4, hue: 145 };
    expect(isInSrgbGamut(outside)).toBe(false);
    const mapped = mapToSrgbGamut(outside);
    expect(mapped.lightness).toBe(0.7);
    expect(mapped.hue).toBe(145);
    expect(mapped.chroma).toBeLessThan(0.4);
    expect(isInSrgbGamut(mapped)).toBe(true);
    expect(isInSrgbGamut({ ...mapped, chroma: mapped.chroma + 0.002 })).toBe(false);
  });

  it("clamps lightness outside 0..1 to black or white", () => {
    expect(formatHexColor(fromOklch({ lightness: 1.5, chroma: 0.2, hue: 40 }))).toBe("#ffffff");
    expect(formatHexColor(fromOklch({ lightness: -1, chroma: 0.2, hue: 40 }))).toBe("#000000");
  });

  it("keeps the hue of a strongly mapped colour within a degree after quantising", () => {
    const mapped = fromOklch({ lightness: 0.55, chroma: 0.4, hue: 260 });
    expect(Math.abs(toOklch(mapped).hue - 260)).toBeLessThan(1);
  });
});
