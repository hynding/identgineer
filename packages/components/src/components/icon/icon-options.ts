export const ICON_SIZES = ["sm", "md", "lg", "xl"] as const;

export type IconSize = (typeof ICON_SIZES)[number];
