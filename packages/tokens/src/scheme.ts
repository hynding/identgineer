export const SCHEMES = ["light", "dark"] as const;

export type Scheme = (typeof SCHEMES)[number];
