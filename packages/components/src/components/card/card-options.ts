export const CARD_VARIANTS = ["plain", "raised", "outlined", "accent"] as const;
export const CARD_PADDINGS = ["none", "sm", "md", "lg"] as const;

export type CardVariant = (typeof CARD_VARIANTS)[number];
export type CardPadding = (typeof CARD_PADDINGS)[number];

export const MIN_HEADING_LEVEL = 1;
export const MAX_HEADING_LEVEL = 6;
export const DEFAULT_HEADING_LEVEL = 3;
