export const SKELETON_VARIANTS = ["text", "rect", "circle"] as const;

export type SkeletonVariant = (typeof SKELETON_VARIANTS)[number];

export const MAX_LINES = 10;
