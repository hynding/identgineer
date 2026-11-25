import type {
  BrandSwatchesPalette,
  BrandSwatchesScheme,
} from "../brand-swatches/brand-swatches-types";

/** An sRGB colour as three channels from 0 to 255, the form a parsed brand kit keeps its colours in. */
export type BrandGuidelinesRgb = readonly [number, number, number];

/** The colours a kit was made from: `parseBrandKit` keeps them as numbers. */
export interface BrandGuidelinesColors {
  readonly primary: BrandGuidelinesRgb;
  readonly secondary?: BrandGuidelinesRgb;
  readonly neutralTint?: BrandGuidelinesRgb;
}

/**
 * A brand kit as `parseBrandKit` returns it. Declared here, not imported, so the component names
 * only what it reads and drags none of the brand package's pipeline into its types; a `BrandKit`
 * of the brand package fits it. Every field is read defensively all the same: a kit built by hand
 * or read back from storage may hold anything.
 */
export interface BrandGuidelinesKit {
  readonly name: string;
  readonly tagline?: string;
  readonly logo?: string;
  readonly mark?: string;
  readonly colors?: BrandGuidelinesColors;
  readonly typography: string;
  readonly corners: string;
  readonly tone: string;
}

/** One scheme of a theme's document: its colours, and the brand gradient it may carry. */
export interface BrandGuidelinesScheme extends BrandSwatchesScheme {
  readonly gradient?: unknown;
}

export interface BrandGuidelinesPalette extends BrandSwatchesPalette {
  readonly light: BrandGuidelinesScheme;
  readonly dark: BrandGuidelinesScheme;
}

/**
 * A theme from `generateBrandTheme`, or just its `document`, which has the colours and the
 * gradient but not the corner radii, the adjustments or the notes. A `BrandTheme` of the brand
 * package fits it.
 */
export type BrandGuidelinesTheme =
  | BrandGuidelinesPalette
  | {
      readonly document: BrandGuidelinesPalette;
      readonly radius?: Readonly<Record<string, string>>;
      readonly adjustments?: readonly unknown[];
      readonly notes?: readonly unknown[];
    };
