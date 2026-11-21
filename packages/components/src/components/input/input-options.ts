export const INPUT_TYPES = ["text", "email", "password", "search", "tel", "url", "number"] as const;
export const INPUT_SIZES = ["sm", "md", "lg"] as const;

export type InputType = (typeof INPUT_TYPES)[number];
export type InputSize = (typeof INPUT_SIZES)[number];
