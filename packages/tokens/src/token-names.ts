import { toCssVariableName } from "./emit-css.ts";
import { withAccentEdge } from "./accent-edge.ts";
import { flattenTokens } from "./flatten-tokens.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { resolveShared } from "./resolve-theme.ts";
import { SHARED_SOURCES } from "./theme-sources.ts";

/** Every custom property the package defines, in emission order. Themes only override a subset. */
export const TOKEN_NAMES: readonly string[] = withAccentEdge(
  resolveShared(mergeTokens(...SHARED_SOURCES.map(({ file, json }) => flattenTokens(file, json)))),
).map((token) => toCssVariableName(token.path));
