import { formatValue } from "./emit-css.ts";
import { flattenTokens } from "./flatten-tokens.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { parseTheme } from "./parse-theme.ts";
import type { ParsedTheme } from "./parse-theme.ts";
import { resolveThemeScheme } from "./resolve-theme.ts";
import { SCHEMES } from "./scheme.ts";
import type { Scheme } from "./scheme.ts";
import { THEME_IDS } from "./theme-ids.ts";
import type { ThemeId } from "./theme-ids.ts";
import { TOKEN_SOURCES } from "./token-sources.ts";
import type { TokenSources } from "./build-token-files.ts";
import type { ResolvedToken } from "./token-types.ts";

export interface ThemeSwatches {
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly accent: string;
  readonly accentSubtle: string;
}

export interface ThemeDefinition {
  readonly id: ThemeId;
  readonly label: string;
  readonly description: string;
  /** Resolved typography as CSS font-family values, for previews. */
  readonly fonts: { readonly display: string; readonly body: string; readonly mono: string };
  readonly swatches: Readonly<Record<Scheme, ThemeSwatches>>;
}

function isThemeId(id: string): id is ThemeId {
  return THEME_IDS.some((known) => known === id);
}

function pick(tokens: readonly ResolvedToken[], path: string, theme: ParsedTheme): string {
  const token = tokens.find((candidate) => candidate.path === path);
  if (!token) throw new Error(`${theme.file}: theme "${theme.id}" does not define "${path}"`);
  return formatValue(token);
}

function swatchesFor(tokens: readonly ResolvedToken[], theme: ParsedTheme): ThemeSwatches {
  return {
    bg: pick(tokens, "color.bg", theme),
    surface: pick(tokens, "color.surface", theme),
    text: pick(tokens, "color.text", theme),
    accent: pick(tokens, "color.accent", theme),
    accentSubtle: pick(tokens, "color.accent-subtle", theme),
  };
}

/** Everything is read from the same JSON the CSS is built from, so the two cannot drift. */
export function buildThemeRegistry(sources: TokenSources): ThemeDefinition[] {
  const shared = mergeTokens(...sources.shared.map(({ file, json }) => flattenTokens(file, json)));
  return sources.themes.map((source) => {
    if (!isThemeId(source.id)) {
      throw new Error(`${source.file}: "${source.id}" is not a known theme id`);
    }
    const theme = parseTheme(source);
    const [light, dark] = SCHEMES.map((scheme) => resolveThemeScheme(shared, theme, scheme));
    if (!light || !dark) throw new Error(`${source.file}: could not resolve both schemes`);
    return {
      id: source.id,
      label: theme.label,
      description: theme.description,
      fonts: {
        display: pick(light, "font.family.display", theme),
        body: pick(light, "font.family.body", theme),
        mono: pick(light, "font.family.mono", theme),
      },
      swatches: { light: swatchesFor(light, theme), dark: swatchesFor(dark, theme) },
    };
  });
}

export const THEMES: readonly ThemeDefinition[] = buildThemeRegistry(TOKEN_SOURCES);
