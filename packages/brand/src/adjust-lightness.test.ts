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
    if (!found) throw new Error("expected a colour");
    expect(passes(found)).toBe(true);
    const moved = toOklch(found);
    expect(moved.lightness).toBeLessThan(start.lightness);
    expect(start.lightness - moved.lightness).toBeLessThan(0.2);
  });

  it("returns undefined when nothing in that direction passes", () => {
    expect(adjustLightness(toOklch([128, 128, 128]), "lighter", () => false)).toBeUndefined();
  });

  it("finds a passing band in the middle, where neither the start nor the extreme passes", () => {
    // Dark text needs the fill light enough; a white page needs it dark enough: only a band passes.
    const ink: Rgb = [20, 20, 20];
    const passes = (rgb: Rgb) =>
      contrastBetween(rgb, ink) >= 4.5 && contrastBetween(rgb, WHITE) >= 3;
    const found = adjustLightness(toOklch([255, 230, 0]), "darker", passes);
    expect(found && passes(found)).toBe(true);
  });
});
