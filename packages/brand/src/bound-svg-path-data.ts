import { type Geometry, measurePathData } from "./svg-drawing-cost.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import { SVG_GRAMMARS } from "./svg-values.ts";

/**
 * The upper bounds the drawing cost and the overdraw work from for path data as written: its
 * length, which its dashes follow, and the box that holds everything it can draw. `undefined` for
 * path data the sanitiser does not keep.
 */
export function boundSvgPathData(written: string): Pick<Geometry, "length" | "box"> | undefined {
  const value = SVG_GRAMMARS.d?.(written, SVG_LOGO_LIMITS);
  if (value === undefined || !("text" in value)) return undefined;
  const { length, box } = measurePathData(value.text);
  return { length, box };
}
