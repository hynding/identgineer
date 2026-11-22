import type { Rgb } from "./srgb.ts";

// The same arithmetic, in the same order, as the tokens package's check, so a colour chosen here
// passes there with exactly the ratio computed here. contrast.test.ts holds the two equal.
function linearizeChannel(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance of an 8-bit sRGB colour. */
export function luminanceOf([red, green, blue]: Rgb): number {
  return (
    0.2126 * linearizeChannel(red) +
    0.7152 * linearizeChannel(green) +
    0.0722 * linearizeChannel(blue)
  );
}

/** WCAG 2.2 contrast ratio, between 1 and 21, independent of argument order. */
export function contrastBetween(first: Rgb, second: Rgb): number {
  const a = luminanceOf(first);
  const b = luminanceOf(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
