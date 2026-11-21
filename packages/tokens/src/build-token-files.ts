import { emitBaseCss, emitStylesheet, emitThemeCss } from "./emit-css.ts";
import { emitDesignCss, emitPreferencesCss, emitUxCss } from "./emit-mode-css.ts";
import { flattenTokens } from "./flatten-tokens.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { parseMode, type ModeSource } from "./parse-mode.ts";
import { parsePreferences, type PreferencesSource } from "./parse-preferences.ts";
import { parseTheme, type ThemeSource } from "./parse-theme.ts";
import { resolveMode } from "./resolve-mode.ts";
import { resolveShared, resolveThemeScheme } from "./resolve-theme.ts";
import type { FlatToken } from "./token-types.ts";

export interface SharedSource {
  readonly file: string;
  readonly json: unknown;
}

export interface TokenSources {
  /** Scheme-independent documents, in cascade order; later documents override earlier ones. */
  readonly shared: readonly SharedSource[];
  readonly themes: readonly ThemeSource[];
  readonly designs: readonly ModeSource[];
  readonly uxModes: readonly ModeSource[];
  readonly preferences: PreferencesSource;
  readonly defaultThemeId: string;
  readonly defaultDesignId: string;
  readonly defaultUxModeId: string;
}

interface Body {
  readonly id: string;
  readonly body: string;
}

function assertDefaultExists(
  ids: readonly string[],
  defaultId: string,
  noun: string,
  plural: string,
): void {
  if (!ids.includes(defaultId)) {
    throw new Error(`default ${noun} "${defaultId}" is not among the ${plural}`);
  }
}

function themeBodies(sources: TokenSources, shared: readonly FlatToken[]): Body[] {
  return sources.themes.map((source) => {
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
}

function designBodies(sources: TokenSources, shared: readonly FlatToken[]): Body[] {
  return sources.designs.map((source) => {
    const design = parseMode(source, "design");
    return {
      id: design.id,
      body: emitDesignCss({
        id: design.id,
        isDefault: design.id === sources.defaultDesignId,
        tokens: resolveMode(shared, design.tokens),
        opaque: resolveMode(shared, design.opaque),
      }),
    };
  });
}

function uxBodies(sources: TokenSources, shared: readonly FlatToken[]): Body[] {
  return sources.uxModes.map((source) => {
    const mode = parseMode(source, "ux");
    return {
      id: mode.id,
      body: emitUxCss({
        id: mode.id,
        isDefault: mode.id === sources.defaultUxModeId,
        tokens: resolveMode(shared, mode.tokens),
      }),
    };
  });
}

function preferencesBody(sources: TokenSources, shared: readonly FlatToken[]): string {
  const { groups } = parsePreferences(sources.preferences);
  return emitPreferencesCss(
    groups.map(({ name, tokens }) => ({ name, tokens: resolveMode(shared, tokens) })),
  );
}

function filesFor(directory: string, bodies: readonly Body[]): [string, string][] {
  return bodies.map(({ id, body }) => [`${directory}/${id}.css`, emitStylesheet(body)]);
}

/** Pure: every emitted file keyed by its path relative to `dist`, in a stable order. */
export function buildTokenFiles(sources: TokenSources): Record<string, string> {
  assertDefaultExists(
    sources.themes.map(({ id }) => id),
    sources.defaultThemeId,
    "theme",
    "themes",
  );
  assertDefaultExists(
    sources.designs.map(({ id }) => id),
    sources.defaultDesignId,
    "design",
    "designs",
  );
  assertDefaultExists(
    sources.uxModes.map(({ id }) => id),
    sources.defaultUxModeId,
    "UX mode",
    "UX modes",
  );
  const shared = mergeTokens(...sources.shared.map(({ file, json }) => flattenTokens(file, json)));
  const baseBody = emitBaseCss(resolveShared(shared));
  const themes = themeBodies(sources, shared);
  const designs = designBodies(sources, shared);
  const uxModes = uxBodies(sources, shared);
  const preferences = preferencesBody(sources, shared);

  return {
    "tokens.css": emitStylesheet(baseBody),
    ...Object.fromEntries(filesFor("themes", themes)),
    ...Object.fromEntries(filesFor("designs", designs)),
    ...Object.fromEntries(filesFor("ux", uxModes)),
    "preferences.css": emitStylesheet(preferences),
    "index.css": emitStylesheet(
      baseBody,
      ...[...themes, ...designs, ...uxModes].map(({ body }) => body),
      preferences,
    ),
  };
}
