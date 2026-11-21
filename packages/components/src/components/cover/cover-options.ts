import { SIZE_STEPS } from "../../utils/layout-steps";

export const COVER_HEIGHTS = [...SIZE_STEPS, "screen"] as const;

export type CoverHeight = (typeof COVER_HEIGHTS)[number];
