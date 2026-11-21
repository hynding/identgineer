export const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
export const BUTTON_SIZES = ["sm", "md", "lg"] as const;
export const BUTTON_TYPES = ["button", "submit", "reset"] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = (typeof BUTTON_SIZES)[number];
export type ButtonType = (typeof BUTTON_TYPES)[number];
