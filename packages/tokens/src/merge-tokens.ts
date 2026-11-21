import type { FlatToken } from "./token-types.ts";

/** Later lists override earlier ones by path; the first position of a path is kept for stable ordering. */
export function mergeTokens(...lists: readonly (readonly FlatToken[])[]): FlatToken[] {
  const merged = new Map<string, FlatToken>();
  for (const list of lists) {
    for (const token of list) {
      merged.set(token.path, token);
    }
  }
  return [...merged.values()];
}
