export const PROGRESS_SIZES = ["sm", "md", "lg"] as const;

export type ProgressSize = (typeof PROGRESS_SIZES)[number];
