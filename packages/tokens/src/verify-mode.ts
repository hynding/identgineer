import type { ModeAxis, ParsedMode } from "./parse-mode.ts";
import type { FlatToken } from "./token-types.ts";

const NOUNS: Record<ModeAxis, string> = { design: "design", layout: "layout", ux: "UX mode" };

/**
 * A design, layout or UX mode must state every token its axis owns, so it can never silently inherit
 * another mode's value, and must set nothing another axis owns. Returns located messages.
 */
export function findModeProblems(
  axis: ModeAxis,
  mode: ParsedMode,
  defaults: readonly FlatToken[],
): string[] {
  const roles = new Set(defaults.map((token) => token.path));
  const defined = new Set(mode.tokens.map((token) => token.path));
  const problems: string[] = [];

  for (const role of roles) {
    if (!defined.has(role)) {
      problems.push(`${mode.file}: ${NOUNS[axis]} "${mode.id}" does not define "${role}"`);
    }
  }
  const reported = new Set<string>();
  for (const { path } of [...mode.tokens, ...mode.opaque]) {
    if (!roles.has(path) && !reported.has(path)) {
      reported.add(path);
      problems.push(`${mode.file}: "${path}" is not a ${axis}-owned token`);
    }
  }
  return problems;
}
