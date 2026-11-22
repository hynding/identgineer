import type { TypographyId } from "./font-pairings.ts";
import type { Rgb } from "./srgb.ts";

/** Corner styles; each maps to a set of radius tokens. */
export const CORNERS = ["sharp", "soft", "round"] as const;
export type Corners = (typeof CORNERS)[number];

/** How much the generated palette leans towards quiet or punchy colour and contrast. */
export const TONES = ["calm", "balanced", "vivid"] as const;
export type Tone = (typeof TONES)[number];

/** Colours are kept as parsed numbers: no input string survives parsing. */
export interface BrandColors {
  readonly primary: Rgb;
  readonly secondary?: Rgb;
  /** Tints the neutrals (backgrounds, text, borders); its hue is used, its chroma kept low. */
  readonly neutralTint?: Rgb;
}

export interface BrandKit {
  /** Becomes the `data-theme` value. */
  readonly id: string;
  readonly name: string;
  readonly tagline?: string;
  readonly colors: BrandColors;
  readonly typography: TypographyId;
  readonly corners: Corners;
  readonly tone: Tone;
}
