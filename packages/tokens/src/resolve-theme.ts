import { mergeTokens } from "./merge-tokens.ts";
import { onlyEmitted } from "./emitted-tokens.ts";
import type { ParsedTheme } from "./parse-theme.ts";
import { resolveAliases } from "./resolve-aliases.ts";
import type { Scheme } from "./scheme.ts";
import type { FlatToken, ResolvedToken } from "./token-types.ts";
import { assertValidColors } from "./validate-colors.ts";

/** Shared, scheme-independent tokens resolved on their own; these are the `idg.tokens` layer. */
export function resolveShared(shared: readonly FlatToken[]): ResolvedToken[] {
  const resolved = resolveAliases(shared);
  assertValidColors(resolved);
  return onlyEmitted(resolved);
}

/**
 * The custom properties one theme sets for one scheme, resolved against the shared tokens so
 * theme aliases can reach shared palettes. Light carries the scheme-independent typography as
 * well, because the light rule matches regardless of scheme; dark carries only what flips.
 */
export function resolveThemeScheme(
  shared: readonly FlatToken[],
  theme: ParsedTheme,
  scheme: Scheme,
): ResolvedToken[] {
  const schemeTokens = theme[scheme];
  const ownPaths = new Set(
    (scheme === "light" ? [...theme.common, ...schemeTokens] : schemeTokens).map(
      (token) => token.path,
    ),
  );
  const resolved = resolveAliases(mergeTokens(shared, theme.common, schemeTokens));
  assertValidColors(resolved);
  return onlyEmitted(resolved).filter((token) => ownPaths.has(token.path));
}
