export const BADGE_VARIANTS = [
  "neutral",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
] as const;
export const BADGE_SIZES = ["sm", "md"] as const;

export type BadgeVariant = (typeof BADGE_VARIANTS)[number];
export type BadgeSize = (typeof BADGE_SIZES)[number];
