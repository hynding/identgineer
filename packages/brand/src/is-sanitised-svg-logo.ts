import { DEFAULT_ID_PREFIX, ID_PREFIX_PATTERN, sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import type { SanitisedSvg } from "./sanitised-svg.ts";

// The sanitiser writes `id="<prefix><number>"` and nothing else in an id.
const FIRST_ID = / id="([a-z][a-z0-9-]{0,22}-)\d+"/;

function isFixedPoint(value: string, idPrefix: string): boolean {
  const result = sanitiseSvgLogo(value, { idPrefix });
  return result.ok && result.svg === value;
}

/**
 * Whether a value is exactly what `sanitiseSvgLogo` returns for it: a fixed point of the sanitiser,
 * read again in full rather than trusted for its type. Every sanitiser output passes (with
 * whichever id prefix it was given); anything else, an edited output included, fails.
 */
export function isSanitisedSvgLogo(value: unknown): value is SanitisedSvg {
  if (typeof value !== "string") return false;
  if (isFixedPoint(value, DEFAULT_ID_PREFIX)) return true;
  const prefix = FIRST_ID.exec(value)?.[1];
  return (
    prefix !== undefined &&
    prefix !== DEFAULT_ID_PREFIX &&
    ID_PREFIX_PATTERN.test(prefix) &&
    isFixedPoint(value, prefix)
  );
}
