/** An sRGB colour as three channels from 0 to 255. */
export type Rgb = readonly [number, number, number];

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/**
 * Reads `#rgb` or `#rrggbb` (either case) into numbers, or `undefined` for anything else. Only the
 * numbers are kept: the input string is never passed on.
 */
export function parseHexColor(input: string): Rgb | undefined {
  const long = LONG_HEX.exec(input);
  if (long?.[1] !== undefined && long[2] !== undefined && long[3] !== undefined) {
    return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)];
  }
  const short = SHORT_HEX.exec(input);
  if (short?.[1] !== undefined && short[2] !== undefined && short[3] !== undefined) {
    return [
      parseInt(short[1].repeat(2), 16),
      parseInt(short[2].repeat(2), 16),
      parseInt(short[3].repeat(2), 16),
    ];
  }
  return undefined;
}

function toByte(channel: number): number {
  if (Number.isNaN(channel)) return 0;
  return Math.min(255, Math.max(0, Math.round(channel)));
}

/** `#rrggbb` in lower case, built from the numbers alone. */
export function formatHexColor(rgb: Rgb): string {
  return `#${rgb.map((channel) => toByte(channel).toString(16).padStart(2, "0")).join("")}`;
}
