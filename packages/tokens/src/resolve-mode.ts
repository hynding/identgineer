import { onlyEmitted } from "./emitted-tokens.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { resolveAliases } from "./resolve-aliases.ts";
import type { FlatToken, ResolvedToken } from "./token-types.ts";
import { assertValidColors } from "./validate-colors.ts";

/**
 * The custom properties a design, UX mode or preference group sets, resolved against the shared
 * tokens so aliases can reach shared values, and returned in the order the source states them.
 */
export function resolveMode(
  shared: readonly FlatToken[],
  tokens: readonly FlatToken[],
): ResolvedToken[] {
  const resolved = resolveAliases(mergeTokens(shared, tokens));
  assertValidColors(resolved);
  const byPath = new Map(onlyEmitted(resolved).map((token) => [token.path, token]));
  return tokens.flatMap((token) => byPath.get(token.path) ?? []);
}
