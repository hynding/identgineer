import { formatValue, toCssVariableName } from "./emit-css.ts";
import type { ResolvedToken } from "./token-types.ts";

const RADIUS_PREFIX = "shape.radius.";

/** The custom property a generated brand theme sets to state its preference for one radius. */
export function brandRadiusVariableName(radiusName: string): string {
  return toCssVariableName(`brand.radius.${radiusName}`);
}

/**
 * A design's radii resolved as the brand's preference, with the design's own value as the
 * fallback. Nothing but a brand theme declares the preference, so without one each radius computes
 * to exactly the design's value.
 */
export function followBrandCorners(tokens: readonly ResolvedToken[]): ResolvedToken[] {
  return tokens.map((token) => {
    if (!token.path.startsWith(RADIUS_PREFIX)) return token;
    const name = token.path.slice(RADIUS_PREFIX.length);
    return { ...token, value: `var(${brandRadiusVariableName(name)}, ${formatValue(token)})` };
  });
}
