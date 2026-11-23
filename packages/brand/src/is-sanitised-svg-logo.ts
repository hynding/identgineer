import type { SanitisedSvg } from "./sanitised-svg.ts";

/** Not written yet: accepts nothing, so the tests that describe it fail. */
export function isSanitisedSvgLogo(value: unknown): value is SanitisedSvg {
  return value === undefined && typeof value === "string";
}
