import type { Rgb } from "./srgb.ts";

export interface Oklab {
  readonly lightness: number;
  readonly a: number;
  readonly b: number;
}

/** OKLCH: perceptual lightness 0..1, chroma from 0, hue in degrees within [0, 360). */
export interface Oklch {
  readonly lightness: number;
  readonly chroma: number;
  readonly hue: number;
}

type Linear = readonly [number, number, number];

// Below this chroma the hue is rounding noise, so a grey is reported with hue 0.
const ACHROMATIC = 1e-6;
// How far outside [0, 1] a linear channel may be and still count as in gamut: float error only.
const GAMUT_EPSILON = 1e-9;
const GAMUT_STEPS = 32;

function toLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  const srgb = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return srgb * 255;
}

// Björn Ottosson's OKLab matrices for linear sRGB (the 2021 revision CSS Color 4 uses).
function linearToOklab([red, green, blue]: Linear): Oklab {
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinear({ lightness, a, b }: Oklab): Linear {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function lchToLab({ lightness, chroma, hue }: Oklch): Oklab {
  const radians = (hue * Math.PI) / 180;
  return { lightness, a: chroma * Math.cos(radians), b: chroma * Math.sin(radians) };
}

export function toOklab(rgb: Rgb): Oklab {
  return linearToOklab([toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])]);
}

export function toOklch(rgb: Rgb): Oklch {
  const { lightness, a, b } = toOklab(rgb);
  const chroma = Math.hypot(a, b);
  if (chroma < ACHROMATIC) return { lightness, chroma: 0, hue: 0 };
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  return { lightness, chroma, hue: degrees < 0 ? degrees + 360 : degrees };
}

export function isInSrgbGamut(color: Oklch): boolean {
  return oklabToLinear(lchToLab(color)).every(
    (channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON,
  );
}

/**
 * The most saturated in-gamut colour with the same lightness and hue: only chroma is reduced, by
 * bisection, so the colour keeps its perceived lightness and hue. Lightness outside 0..1 becomes
 * black or white.
 */
export function mapToSrgbGamut(color: Oklch): Oklch {
  if (color.lightness >= 1) return { lightness: 1, chroma: 0, hue: color.hue };
  if (color.lightness <= 0) return { lightness: 0, chroma: 0, hue: color.hue };
  if (isInSrgbGamut(color)) return color;
  let inside = 0;
  let outside = color.chroma;
  for (let step = 0; step < GAMUT_STEPS; step += 1) {
    const middle = (inside + outside) / 2;
    if (isInSrgbGamut({ ...color, chroma: middle })) inside = middle;
    else outside = middle;
  }
  return { ...color, chroma: inside };
}

/** The gamut-mapped colour as 8-bit sRGB channels. */
export function fromOklch(color: Oklch): Rgb {
  const linear = oklabToLinear(lchToLab(mapToSrgbGamut(color)));
  const [red, green, blue] = linear.map((channel) =>
    Math.min(255, Math.max(0, Math.round(fromLinear(Math.min(1, Math.max(0, channel)))))),
  );
  return [red ?? 0, green ?? 0, blue ?? 0];
}
