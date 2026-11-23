import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoResult } from "./svg-logo-result.ts";

export interface SvgLogoOptions {
  readonly idPrefix?: string;
}

/** Not written yet: refuses everything, so the tests that describe it fail. */
export function sanitiseSvgLogoWithLimits(...input: readonly unknown[]): SvgLogoResult {
  return {
    ok: false,
    errors: [{ code: "internal-error", message: `not read yet (${String(input.length)})` }],
  };
}

export function sanitiseSvgLogo(
  input: string | Uint8Array,
  options?: SvgLogoOptions,
): SvgLogoResult {
  return sanitiseSvgLogoWithLimits(input, options, SVG_LOGO_LIMITS);
}
