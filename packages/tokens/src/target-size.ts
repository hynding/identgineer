import type { ParsedMode } from "./parse-mode.ts";
import { formatValue } from "./emit-css.ts";
import type { ResolvedToken } from "./token-types.ts";

/** WCAG 2.2 AA, success criterion 2.5.8. No UX mode may go below it. */
export const MIN_TARGET_PX = 24;

const PX_PER_REM = 16;
const FIXED_LENGTH = /^(\d+(?:\.\d+)?)(px|rem)$/;
const FLOORED_TOKENS = ["density.target-size", "density.control-height"];

export function toPixels(value: string, where: string): number {
  const match = FIXED_LENGTH.exec(value);
  const amount = match?.[1];
  if (amount === undefined) {
    throw new Error(`${where}: "${value}" is not a fixed px or rem length`);
  }
  return Number(amount) * (match?.[2] === "rem" ? PX_PER_REM : 1);
}

/** Located messages for every floored token a UX mode sets below the minimum target size. */
export function findTargetSizeProblems(
  mode: ParsedMode,
  resolved: readonly ResolvedToken[],
): string[] {
  return FLOORED_TOKENS.flatMap((path) => {
    const token = resolved.find((candidate) => candidate.path === path);
    if (token === undefined) return [];
    const pixels = toPixels(
      formatValue(token),
      `${mode.file}: UX mode "${mode.id}" token "${path}"`,
    );
    return pixels < MIN_TARGET_PX
      ? [
          `${mode.file}: UX mode "${mode.id}" sets "${path}" to ${String(pixels)}px, below the ${String(MIN_TARGET_PX)}px minimum`,
        ]
      : [];
  });
}
