import { fromOklch, type Oklch } from "./oklch.ts";
import type { Rgb } from "./srgb.ts";

const STEPS = 30;

/**
 * The colour nearest `start` in lightness, moving only towards `direction` (darker or lighter, hue
 * kept, chroma reduced only where the gamut demands), whose 8-bit form passes. Every candidate is
 * judged after quantising, so the result passes exactly as tested. When even black or white fails
 * that extreme is returned and the caller's check reports it; the palette is built so it never does.
 */
export function adjustLightness(
  start: Oklch,
  direction: "darker" | "lighter",
  passes: (rgb: Rgb) => boolean,
): Rgb {
  const first = fromOklch(start);
  if (passes(first)) return first;
  const extremeLightness = direction === "darker" ? 0 : 1;
  const extreme = fromOklch({ ...start, lightness: extremeLightness });
  if (!passes(extreme)) return extreme;
  let failing = start.lightness;
  let passing = extremeLightness;
  for (let step = 0; step < STEPS; step += 1) {
    const middle = (failing + passing) / 2;
    if (passes(fromOklch({ ...start, lightness: middle }))) passing = middle;
    else failing = middle;
  }
  return fromOklch({ ...start, lightness: passing });
}
