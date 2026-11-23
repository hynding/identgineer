import { fromOklch, type Oklch } from "./oklch.ts";
import type { Rgb } from "./srgb.ts";

const BISECTION_STEPS = 30;
// Coarse enough to be quick, fine enough not to step over the narrowest passing band the palette
// can produce (about 0.03 in lightness, for a fill between dark text and a white page).
const SCAN_STEP = 0.01;

function bisect(
  start: Oklch,
  failing: number,
  passing: number,
  passes: (rgb: Rgb) => boolean,
): Rgb {
  let low = failing;
  let high = passing;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (passes(fromOklch({ ...start, lightness: middle }))) high = middle;
    else low = middle;
  }
  return fromOklch({ ...start, lightness: high });
}

/**
 * The colour nearest `start` in lightness, moving only towards `direction` (darker or lighter, hue
 * kept, chroma reduced only where the gamut demands), whose 8-bit form passes; `undefined` when no
 * lightness that way passes. Every candidate is judged after quantising, so the result passes
 * exactly as tested. `maxMove` bounds the search, for a caller that already has a nearer answer.
 * When the far end passes it bisects; otherwise the passing lightnesses may be a
 * band in the middle, so it scans for the first one and bisects back from there.
 */
export function adjustLightness(
  start: Oklch,
  direction: "darker" | "lighter",
  passes: (rgb: Rgb) => boolean,
  maxMove = 1,
): Rgb | undefined {
  const first = fromOklch(start);
  if (passes(first)) return first;
  const extreme =
    direction === "darker"
      ? Math.max(0, start.lightness - maxMove)
      : Math.min(1, start.lightness + maxMove);
  if (passes(fromOklch({ ...start, lightness: extreme }))) {
    return bisect(start, start.lightness, extreme, passes);
  }
  const step = direction === "darker" ? -SCAN_STEP : SCAN_STEP;
  const within = (lightness: number) =>
    direction === "darker" ? lightness > extreme : lightness < extreme;
  let previous = start.lightness;
  for (let lightness = start.lightness + step; within(lightness); lightness += step) {
    if (passes(fromOklch({ ...start, lightness })))
      return bisect(start, previous, lightness, passes);
    previous = lightness;
  }
  return undefined;
}
