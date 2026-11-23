import type { Tone } from "./brand-kit.ts";
import type { Scheme } from "@identgineer/tokens";

export interface ToneSettings {
  /** Multiplies the chroma of every generated tint, status colour and neutral; never the accent. */
  readonly chroma: number;
  /** Chroma of the neutrals when the source colour is fully saturated. */
  readonly neutralChroma: number;
  /** Starting lightness of text, muted text and strong borders: further from the page is punchier. */
  readonly text: Readonly<Record<Scheme, number>>;
  readonly mutedText: Readonly<Record<Scheme, number>>;
  readonly strongBorder: Readonly<Record<Scheme, number>>;
  /** Lightness of tinted backgrounds: nearer the middle leaves the gamut room for more colour. */
  readonly subtle: Readonly<Record<Scheme, number>>;
  /** How far the accent's hover state moves away from the text on it. */
  readonly hoverStep: number;
}

export const TONE_SETTINGS: Readonly<Record<Tone, ToneSettings>> = Object.freeze({
  calm: {
    chroma: 0.7,
    neutralChroma: 0.008,
    text: { light: 0.3, dark: 0.9 },
    mutedText: { light: 0.5, dark: 0.74 },
    strongBorder: { light: 0.62, dark: 0.52 },
    subtle: { light: 0.95, dark: 0.28 },
    hoverStep: 0.05,
  },
  balanced: {
    chroma: 1,
    neutralChroma: 0.014,
    text: { light: 0.24, dark: 0.94 },
    mutedText: { light: 0.46, dark: 0.77 },
    strongBorder: { light: 0.58, dark: 0.56 },
    subtle: { light: 0.935, dark: 0.3 },
    hoverStep: 0.06,
  },
  vivid: {
    chroma: 1.3,
    neutralChroma: 0.022,
    text: { light: 0.18, dark: 0.97 },
    mutedText: { light: 0.42, dark: 0.8 },
    strongBorder: { light: 0.54, dark: 0.6 },
    subtle: { light: 0.915, dark: 0.33 },
    hoverStep: 0.08,
  },
});
