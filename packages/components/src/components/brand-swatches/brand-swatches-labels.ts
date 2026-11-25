/**
 * The words of idg-brand-swatches. Override any of them through `labels`; the placeholders in
 * braces are filled in where a default has them.
 */
export interface BrandSwatchesLabels {
  /** The accessible name of the whole, when `label` is not set. */
  readonly name: string;
  readonly light: string;
  readonly dark: string;
  readonly groupPage: string;
  readonly groupText: string;
  readonly groupAccent: string;
  readonly groupStatus: string;
  /** One contrast pair: `{ratio}` and the role of the `{background}`. */
  readonly pair: string;
  /** Said of a pair that meets its level: `{minimum}` is the ratio it needs. */
  readonly passes: string;
  /** Said of a pair below its level. */
  readonly fails: string;
  readonly empty: string;
}

export const BRAND_SWATCHES_LABELS: BrandSwatchesLabels = {
  name: "Brand colours",
  light: "Light",
  dark: "Dark",
  groupPage: "Page",
  groupText: "Text",
  groupAccent: "Accent",
  groupStatus: "Status",
  pair: "{ratio}:1 on {background}",
  passes: "passes {minimum}:1",
  fails: "needs {minimum}:1",
  empty: "No colours to show.",
};
