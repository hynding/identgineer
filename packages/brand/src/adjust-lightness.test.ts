import { describe, expect, it } from "vitest";
import { adjustLightness } from "./adjust-lightness.ts";
import { contrastBetween } from "./contrast.ts";
import { toOklch } from "./oklch.ts";
import type { Rgb } from "./srgb.ts";

const WHITE: Rgb = [255, 255, 255];

describe("adjustLightness", () => {
  it("returns the start colour when it already passes", () => {
    const start = toOklch([29, 78, 216]);
    expect(adjustLightness(start, "darker", (rgb) => contrastBetween(rgb, WHITE) >= 4.5)).toEqual([
      29, 78, 216,
    ]);
  });

  it("moves only as far as it must: one step less would fail", () => {
    const start = toOklch([249, 115, 22]);
    const passes = (rgb: Rgb) => contrastBetween(rgb, WHITE) >= 4.5;
    const found = adjustLightness(start, "darker", passes);
    expect(passes(found)).toBe(true);
    const moved = toOklch(found);
    expect(moved.lightness).toBeLessThan(start.lightness);
    expect(start.lightness - moved.lightness).toBeLessThan(0.2);
  });

  it("returns the extreme when nothing passes, for the caller to report", () => {
    expect(adjustLightness(toOklch([128, 128, 128]), "lighter", () => false)).toEqual(WHITE);
  });
});
