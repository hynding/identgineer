import type { ParsedTheme } from "./parse-theme.ts";
import { INTERNAL_ROOTS } from "./emitted-tokens.ts";
import { SCHEMES } from "./scheme.ts";
import type { FlatToken } from "./token-types.ts";

/** Roles that flip with the scheme, so they must be written out per scheme rather than shared. */
const PER_SCHEME_ROOTS = ["color", "gradient"];

function rootOf(path: string): string {
  return path.split(".")[0] ?? path;
}

/**
 * Themes own colour and typography, and must state every role explicitly in both schemes so a
 * theme can never silently inherit another theme's colour. Returns located messages.
 */
export function findThemeProblems(theme: ParsedTheme, semantic: readonly FlatToken[]): string[] {
  const roles = semantic.map((token) => token.path);
  const roleSet = new Set(roles);
  const problems: string[] = [];

  for (const scheme of SCHEMES) {
    const defined = new Set(theme[scheme].map((token) => token.path));
    const shared = new Set(theme.common.map((token) => token.path));
    for (const role of roles) {
      const found = PER_SCHEME_ROOTS.includes(rootOf(role))
        ? defined.has(role)
        : defined.has(role) || shared.has(role);
      if (!found) problems.push(`${theme.file}: ${scheme} scheme does not define "${role}"`);
    }
  }

  const everything = [...theme.common, ...theme.light, ...theme.dark];
  const reported = new Set<string>();
  for (const { path } of everything) {
    const owned = roleSet.has(path) || INTERNAL_ROOTS.includes(rootOf(path));
    if (!owned && !reported.has(path)) {
      reported.add(path);
      problems.push(
        `${theme.file}: "${path}" is not a theme-owned role (themes own colour and typography only)`,
      );
    }
  }
  return problems;
}
