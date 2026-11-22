import type { Corners } from "./brand-kit.ts";

/** The design-owned `shape.radius.*` tokens a brand kit's corners set. */
export const RADIUS_NAMES = ["sm", "md", "lg", "pill"] as const;
export type RadiusName = (typeof RADIUS_NAMES)[number];
export type BrandRadius = Readonly<Record<RadiusName, string>>;

export const CORNER_RADII: Readonly<Record<Corners, BrandRadius>> = Object.freeze({
  sharp: Object.freeze({ sm: "0rem", md: "0.125rem", lg: "0.25rem", pill: "0.25rem" }),
  soft: Object.freeze({ sm: "0.25rem", md: "0.5rem", lg: "0.75rem", pill: "9999px" }),
  round: Object.freeze({ sm: "0.5rem", md: "1rem", lg: "1.5rem", pill: "9999px" }),
});
