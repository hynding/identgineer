export type Rgb = readonly [number, number, number];

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** Only `#rrggbb` is accepted so luminance is exact and CSS output is deterministic. */
export function parseHexColor(input: string, where = "colour"): Rgb {
  const match = HEX_COLOR.exec(input);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    throw new Error(`invalid colour "${input}" for ${where}: expected #rrggbb`);
  }
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function linearizeChannel(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHexColor(hex);
  return (
    0.2126 * linearizeChannel(red) +
    0.7152 * linearizeChannel(green) +
    0.0722 * linearizeChannel(blue)
  );
}

/** WCAG 2.2 contrast ratio, between 1 and 21, independent of argument order. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
