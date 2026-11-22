// The theme pipeline for packages that build themes of their own (@identgineer/brand): the same
// parsing, resolution, verification, contrast checks and emission the built-in themes go through.
export { CONTRAST_PAIRS, findContrastFailures, formatContrastFailure } from "./check-contrast.ts";
export type { ContrastFailure, ContrastPair } from "./check-contrast.ts";
export {
  attributeSelector,
  emitDeclarationRule,
  emitStylesheet,
  emitThemeCss,
  LAYER_ORDER,
} from "./emit-css.ts";
export type { ThemeCssInput } from "./emit-css.ts";
export { flattenTokens } from "./flatten-tokens.ts";
export { mergeTokens } from "./merge-tokens.ts";
export { parseTheme } from "./parse-theme.ts";
export type { ParsedTheme, ThemeSource } from "./parse-theme.ts";
export { resolveThemeScheme } from "./resolve-theme.ts";
export { ROLE_SOURCES, SHARED_SOURCES, THEME_SOURCES } from "./theme-sources.ts";
export type { FlatToken, GradientStop, ResolvedToken, TokenType } from "./token-types.ts";
export { findThemeProblems } from "./verify-theme.ts";
