/** Registry order. `top-bar` is the default, and the first entry. */
export const LAYOUT_IDS = [
  "top-bar",
  "side-rail",
  "split-hero",
  "magazine",
  "dashboard",
  "centered",
  "bento",
  "immersive",
] as const;

export type LayoutId = (typeof LAYOUT_IDS)[number];

export const DEFAULT_LAYOUT_ID: LayoutId = "top-bar";
