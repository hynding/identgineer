import type { ResolvedToken } from "./token-types.ts";

/** Root groups that only feed aliases (raw palettes, font stacks) and never become custom properties. */
export const INTERNAL_ROOTS: readonly string[] = ["palette", "stack"];

export function isEmitted(path: string): boolean {
  const root = path.split(".")[0] ?? path;
  return !INTERNAL_ROOTS.includes(root);
}

export function onlyEmitted(tokens: readonly ResolvedToken[]): ResolvedToken[] {
  return tokens.filter((token) => isEmitted(token.path));
}
