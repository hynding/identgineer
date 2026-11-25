/**
 * The words of idg-brand-guidelines. Override any of them through `labels`; the placeholders in
 * braces are filled in where a default has them. The words of the colour swatches the guide holds
 * are those of `swatchLabels`.
 */
export interface BrandGuidelinesLabels {
  /** The accessible name of the whole, when `label` is not set. */
  readonly name: string;
  readonly light: string;
  readonly dark: string;

  readonly logoHeading: string;
  readonly logo: string;
  readonly mark: string;
  /** What a logo is judged on, written after "on a": `{backing}` of `logoOn`. */
  readonly lightBacking: string;
  readonly darkBacking: string;
  /** The caption of one logo or mark on one backing: the `{asset}` and the `{backing}`. */
  readonly logoOn: string;
  readonly noLogo: string;
  readonly noMark: string;

  readonly coloursHeading: string;
  readonly madeFrom: string;
  readonly primary: string;
  readonly secondary: string;
  readonly neutralTint: string;
  /** The accessible name of the swatches: the brand's `{name}`. */
  readonly swatchesName: string;

  readonly gradientHeading: string;
  /** One stop of a gradient: its `{colour}` and its `{percent}` along the bar. */
  readonly gradientStop: string;

  readonly typographyHeading: string;
  readonly pairing: string;
  readonly headingFace: string;
  readonly bodyFace: string;
  /** The weight, line height and letter spacing of a face, as `{weight}`, `{lineHeight}`, `{letterSpacing}`. */
  readonly weight: string;
  readonly lineHeight: string;
  readonly letterSpacing: string;
  readonly headingSample: string;
  readonly bodySample: string;
  readonly fontNote: string;

  readonly cornersHeading: string;
  readonly cornersSharp: string;
  readonly cornersSoft: string;
  readonly cornersRound: string;
  readonly radiusSm: string;
  readonly radiusMd: string;
  readonly radiusLg: string;
  readonly radiusPill: string;
  /** One sample: the radius's `{name}` and its `{value}`. */
  readonly radius: string;

  readonly toneHeading: string;
  readonly toneCalm: string;
  readonly toneBalanced: string;
  readonly toneVivid: string;

  readonly notesHeading: string;
  readonly notesSubheading: string;
  readonly adjustmentsSubheading: string;
  /** A status colour close to the accent: the `{scheme}`, the `{role}`, the `{distance}`. */
  readonly noteStatusNearAccent: string;
  /** An accent close to the page: the `{scheme}`, the `{ratio}` against `{against}`. */
  readonly noteAccentBlends: string;
  /** A colour that was moved: `{scheme}`, `{role}`, `{origin}`, `{requested}`, `{used}`, `{minimum}`, `{against}`, `{before}`, `{after}`. */
  readonly adjustment: string;
  readonly originPrimary: string;
  readonly originSecondary: string;
  readonly originGenerated: string;
  readonly more: string;
  readonly nothingMoved: string;

  readonly empty: string;
}

export const BRAND_GUIDELINES_LABELS: BrandGuidelinesLabels = {
  name: "Brand guidelines",
  light: "Light",
  dark: "Dark",

  logoHeading: "Logo and mark",
  logo: "Logo",
  mark: "Mark",
  lightBacking: "light background",
  darkBacking: "dark background",
  logoOn: "{asset} on a {backing}",
  noLogo: "This kit has no logo, so its name stands in for it as a wordmark.",
  noMark: "This kit has no mark, so the first letters of its name stand in for it.",

  coloursHeading: "Colours",
  madeFrom: "Made from",
  primary: "Primary",
  secondary: "Secondary",
  neutralTint: "Neutral tint",
  swatchesName: "{name} colours",

  gradientHeading: "Gradient",
  gradientStop: "{colour} at {percent}%",

  typographyHeading: "Typography",
  pairing: "Font pairing",
  headingFace: "Headings",
  bodyFace: "Body text",
  weight: "weight {weight}",
  lineHeight: "line height {lineHeight}",
  letterSpacing: "letter spacing {letterSpacing}",
  headingSample: "Every detail says who you are",
  bodySample:
    "The quick brown fox jumps over the lazy dog. Body text carries most of what a reader meets.",
  fontNote:
    "Shown in the fonts this page has loaded, and the next in the stack where one is missing. Nothing is fetched.",

  cornersHeading: "Corners",
  cornersSharp: "Sharp corners",
  cornersSoft: "Soft corners",
  cornersRound: "Round corners",
  radiusSm: "Small",
  radiusMd: "Medium",
  radiusLg: "Large",
  radiusPill: "Pill",
  radius: "{name}: {value}",

  toneHeading: "Tone",
  toneCalm: "Calm: quiet colour and gentle contrast.",
  toneBalanced: "Balanced: colour and contrast in measure.",
  toneVivid: "Vivid: strong colour and punchy contrast.",

  notesHeading: "Notes and adjustments",
  notesSubheading: "Worth knowing",
  adjustmentsSubheading: "Colours moved to meet a contrast level",
  noteStatusNearAccent:
    "In the {scheme} scheme the {role} colour is close to the accent (a distance of {distance}), so a primary and a {role} button can look alike.",
  noteAccentBlends:
    "In the {scheme} scheme the accent is {ratio}:1 against {against}, close to the page, so a primary action reads by its edge alone.",
  adjustment:
    "In the {scheme} scheme {role} moved from {requested} to {used} ({origin}) to reach {minimum}:1 against {against}: it was {before}:1 and is now {after}:1.",
  originPrimary: "from your primary colour",
  originSecondary: "from your secondary colour",
  originGenerated: "a generated colour",
  more: "And {count} more.",
  nothingMoved: "The generator moved no colour and has nothing to flag.",

  empty: "Nothing to show.",
};
