/** Registry order. `comfortable` is the default, and the first entry. */
export const UX_MODE_IDS = [
  "comfortable",
  "compact",
  "spacious",
  "playful",
  "calm",
  "focus",
  "guided",
  "power",
] as const;

export type UxModeId = (typeof UX_MODE_IDS)[number];

export const DEFAULT_UX_MODE_ID: UxModeId = "comfortable";
