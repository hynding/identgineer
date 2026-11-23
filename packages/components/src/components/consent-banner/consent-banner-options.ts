export const CONSENT_PLACEMENTS = ["bottom", "top", "inline"] as const;

/** Where the banner sits: a bar that stays in view at the bottom or top, or in the page's flow. */
export type ConsentPlacement = (typeof CONSENT_PLACEMENTS)[number];
