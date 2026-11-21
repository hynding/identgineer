/** Registry order. `aurora` is the default, and the first entry. */
export const THEME_IDS = [
  "aurora",
  "ember",
  "tidal",
  "graphite",
  "citrus",
  "orchid",
  "terminal",
  "paper",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = "aurora";
