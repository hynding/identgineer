import { DEFAULT_ID_PREFIX, ID_PREFIX_PATTERN, sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import type { SanitisedSvg } from "./sanitised-svg.ts";
import type { SvgLogoAccepted } from "./svg-logo-result.ts";

// The sanitiser writes `id="<prefix><number>"` and nothing else in an id.
const FIRST_ID = / id="([a-z][a-z0-9-]{0,22}-)\d+"/;

function fixedPoint(value: string, idPrefix: string): SvgLogoAccepted | undefined {
  const result = sanitiseSvgLogo(value, { idPrefix });
  return result.ok && result.svg === value ? result : undefined;
}

/**
 * What `sanitiseSvgLogo` returned for a value that is exactly its output, read once, or
 * `undefined` for anything else. `isSanitisedSvgLogo` is whether there is one.
 */
export function acceptedLogo(value: unknown): SvgLogoAccepted | undefined {
  if (typeof value !== "string") return undefined;
  const accepted = fixedPoint(value, DEFAULT_ID_PREFIX);
  if (accepted !== undefined) return accepted;
  const prefix = FIRST_ID.exec(value)?.[1];
  return prefix !== undefined && prefix !== DEFAULT_ID_PREFIX && ID_PREFIX_PATTERN.test(prefix)
    ? fixedPoint(value, prefix)
    : undefined;
}

/**
 * Whether a value is exactly what `sanitiseSvgLogo` returns for it: a fixed point of the sanitiser,
 * read again in full rather than trusted for its type. Every sanitiser output passes (with
 * whichever id prefix it was given); anything else, an edited output included, fails.
 */
export function isSanitisedSvgLogo(value: unknown): value is SanitisedSvg {
  return acceptedLogo(value) !== undefined;
}
