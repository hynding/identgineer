import { findSanitisedSvgProblems } from "./svg-output-check.ts";

/**
 * Whether an output is settled: the independent check finds nothing in it, and sanitising it again
 * (`sanitiseAgain`, which returns nothing for a refusal) gives it back unchanged. The sanitiser
 * holds every output to this before returning it, so a gap in any of its steps refuses the logo
 * rather than accepting one that is not its own fixed point.
 */
export function isSettledOutput(
  svg: string,
  sanitiseAgain: (svg: string) => string | undefined,
): boolean {
  return findSanitisedSvgProblems(svg).length === 0 && sanitiseAgain(svg) === svg;
}
