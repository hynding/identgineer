// The public types of the switcher, declared here and not imported. `@identgineer/variations` is
// TypeScript source with `.ts` import specifiers; a declaration that pointed at it would make a
// consumer's compiler fail (TS5097). `variation-switcher-types.test.ts` holds every one of these
// identical to the variations package's own, so they cannot drift.

export type ThemeId =
  "aurora" | "ember" | "tidal" | "graphite" | "citrus" | "orchid" | "terminal" | "paper";

/**
 * A theme id added at run time with the variations package's registerThemeIds (a theme generated
 * from a brand kit). Branded, so only the variations package produces one.
 */
export type RegisteredThemeId = string & { readonly __registeredThemeId: true };

export type DesignId =
  "flat" | "soft" | "glass" | "brutalist" | "outline" | "elevated" | "pixel" | "editorial";

export type LayoutId =
  | "top-bar"
  | "side-rail"
  | "split-hero"
  | "magazine"
  | "dashboard"
  | "centered"
  | "bento"
  | "immersive";

export type UxModeId =
  "comfortable" | "compact" | "spacious" | "playful" | "calm" | "focus" | "guided" | "power";

/** `system` is the absence of `data-scheme`: the theme follows the system preference. */
export type SchemeChoice = "light" | "dark" | "system";

export interface VariationState {
  readonly theme: ThemeId | RegisteredThemeId;
  readonly design: DesignId;
  readonly layout: LayoutId;
  readonly ux: UxModeId;
  readonly scheme: SchemeChoice;
}

export type StateKey = keyof VariationState;

/** Detail of `idgVariationsChange`. */
export interface VariationsChangeDetail {
  /** The whole state after the change. */
  readonly state: VariationState;
  /** The keys whose value is different now. */
  readonly changed: readonly StateKey[];
}

/** The colours of one theme in one colour scheme. */
export interface SwatchColours {
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly accent: string;
  readonly accentSubtle: string;
}

/** What a swatch is drawn from: the theme's colours in both schemes. */
export interface ThemeSwatches {
  readonly light: SwatchColours;
  readonly dark: SwatchColours;
}
