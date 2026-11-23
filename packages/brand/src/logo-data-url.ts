import type { SanitisedSvg } from "./sanitised-svg.ts";

/** Not written yet: returns nothing usable, so the tests that describe it fail. */
export function logoDataUrl(svg: SanitisedSvg): string {
  return svg.slice(0, 0);
}
