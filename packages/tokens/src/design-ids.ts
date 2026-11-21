/** Registry order. `flat` is the default, and the first entry. */
export const DESIGN_IDS = [
  "flat",
  "soft",
  "glass",
  "brutalist",
  "outline",
  "elevated",
  "pixel",
  "editorial",
] as const;

export type DesignId = (typeof DESIGN_IDS)[number];

export const DEFAULT_DESIGN_ID: DesignId = "flat";
