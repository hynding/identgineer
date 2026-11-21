import { emitBaseCss, emitStylesheet, emitThemeCss } from "./emit-css.ts";
import { flattenTokens } from "./flatten-tokens.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { parseTheme, type ThemeSource } from "./parse-theme.ts";
import { resolveShared, resolveThemeScheme } from "./resolve-theme.ts";

export interface SharedSource {
  readonly file: string;
  readonly json: unknown;
}

export interface TokenSources {
  /** Scheme-independent documents, in cascade order; later documents override earlier ones. */
  readonly shared: readonly SharedSource[];
  readonly themes: readonly ThemeSource[];
  readonly defaultThemeId: string;
}

/** Pure: every emitted file keyed by its path relative to `dist`, in a stable order. */
export function buildTokenFiles(sources: TokenSources): Record<string, string> {
  if (!sources.themes.some((theme) => theme.id === sources.defaultThemeId)) {
    throw new Error(`default theme "${sources.defaultThemeId}" is not among the themes`);
  }
  const shared = mergeTokens(...sources.shared.map(({ file, json }) => flattenTokens(file, json)));
  const baseBody = emitBaseCss(resolveShared(shared));

  const themeBodies = sources.themes.map((source) => {
    const theme = parseTheme(source);
    return {
      id: theme.id,
      body: emitThemeCss({
        id: theme.id,
        isDefault: theme.id === sources.defaultThemeId,
        light: resolveThemeScheme(shared, theme, "light"),
        dark: resolveThemeScheme(shared, theme, "dark"),
      }),
    };
  });

  return {
    "tokens.css": emitStylesheet(baseBody),
    ...Object.fromEntries(
      themeBodies.map(({ id, body }) => [`themes/${id}.css`, emitStylesheet(body)]),
    ),
    "index.css": emitStylesheet(baseBody, ...themeBodies.map(({ body }) => body)),
  };
}
