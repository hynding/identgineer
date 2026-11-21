import type { SharedSource, TokenSources } from "./build-token-files.ts";
import { findContrastFailures, formatContrastFailure } from "./check-contrast.ts";
import { INTERNAL_ROOTS } from "./emitted-tokens.ts";
import { flattenTokens } from "./flatten-tokens.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { parseMode } from "./parse-mode.ts";
import { parsePreferences } from "./parse-preferences.ts";
import { parseTheme } from "./parse-theme.ts";
import { resolveMode } from "./resolve-mode.ts";
import { resolveThemeScheme } from "./resolve-theme.ts";
import { SCHEMES } from "./scheme.ts";
import { findTargetSizeProblems } from "./target-size.ts";
import type { FlatToken } from "./token-types.ts";
import { findModeProblems } from "./verify-mode.ts";
import { findOwnershipProblems, type AxisTokens } from "./verify-ownership.ts";
import { findThemeProblems } from "./verify-theme.ts";

export interface RoleSources {
  readonly theme: SharedSource;
  readonly design: SharedSource;
  readonly layout: SharedSource;
  readonly ux: SharedSource;
}

function flatten({ file, json }: SharedSource): FlatToken[] {
  return flattenTokens(file, json);
}

function isOwnable(token: FlatToken): boolean {
  return !INTERNAL_ROOTS.includes(token.path.split(".")[0] ?? token.path);
}

/** Every token each axis sets, so ownership can be checked across themes, designs, layouts and UX modes. */
export function collectAxisTokens(sources: TokenSources, roles: RoleSources): AxisTokens[] {
  const roleFiles = new Set(
    [roles.theme, roles.design, roles.layout, roles.ux].map(({ file }) => file),
  );
  const themeTokens = sources.themes.flatMap((source) => {
    const theme = parseTheme(source);
    return [...theme.common, ...theme.light, ...theme.dark];
  });
  const modeTokens = (modes: typeof sources.designs, axis: "design" | "layout" | "ux") =>
    modes.flatMap((source) => {
      const mode = parseMode(source, axis);
      return [...mode.tokens, ...mode.opaque];
    });
  return [
    {
      axis: "base",
      tokens: sources.shared.filter(({ file }) => !roleFiles.has(file)).flatMap(flatten),
    },
    { axis: "theme", tokens: [...flatten(roles.theme), ...themeTokens].filter(isOwnable) },
    {
      axis: "design",
      tokens: [...flatten(roles.design), ...modeTokens(sources.designs, "design")],
    },
    {
      axis: "layout",
      tokens: [...flatten(roles.layout), ...modeTokens(sources.layouts, "layout")],
    },
    { axis: "ux", tokens: [...flatten(roles.ux), ...modeTokens(sources.uxModes, "ux")] },
  ].map(({ axis, tokens }) => ({ axis, tokens: tokens.filter(isOwnable) }));
}

function findThemeSourceProblems(sources: TokenSources, roles: RoleSources): string[] {
  const shared = mergeTokens(...sources.shared.map(flatten));
  const semantic = flatten(roles.theme);
  return sources.themes.flatMap((source) => {
    const theme = parseTheme(source);
    const contrast = SCHEMES.flatMap((scheme) => {
      const colors = new Map<string, string>();
      for (const token of resolveThemeScheme(shared, theme, scheme)) {
        if (token.type === "color" && typeof token.value === "string") {
          colors.set(token.path.replace(/^color\./, ""), token.value);
        }
      }
      return findContrastFailures(colors).map((failure) =>
        formatContrastFailure(theme.id, scheme, failure),
      );
    });
    return [...findThemeProblems(theme, semantic), ...contrast];
  });
}

function findModeSourceProblems(sources: TokenSources, roles: RoleSources): string[] {
  const shared = mergeTokens(...sources.shared.map(flatten));
  const designs = sources.designs.flatMap((source) =>
    findModeProblems("design", parseMode(source, "design"), flatten(roles.design)),
  );
  const layouts = sources.layouts.flatMap((source) =>
    findModeProblems("layout", parseMode(source, "layout"), flatten(roles.layout)),
  );
  const uxModes = sources.uxModes.flatMap((source) => {
    const mode = parseMode(source, "ux");
    return [
      ...findModeProblems("ux", mode, flatten(roles.ux)),
      ...findTargetSizeProblems(mode, resolveMode(shared, mode.tokens)),
    ];
  });
  return [...designs, ...layouts, ...uxModes];
}

function findPreferenceProblems(sources: TokenSources, roles: RoleSources): string[] {
  const owned = new Set([...flatten(roles.design), ...flatten(roles.ux)].map(({ path }) => path));
  const { file, groups } = parsePreferences(sources.preferences);
  return groups.flatMap(({ name, tokens }) =>
    tokens
      .filter(({ path }) => !owned.has(path))
      .map(
        ({ path }) =>
          `${file}: preference "${name}" sets "${path}", which no design or UX mode owns`,
      ),
  );
}

/** Located messages for everything wrong with the sources; an empty list means they may be built. */
export function findSourceProblems(sources: TokenSources, roles: RoleSources): string[] {
  return [
    ...findThemeSourceProblems(sources, roles),
    ...findModeSourceProblems(sources, roles),
    ...findOwnershipProblems(collectAxisTokens(sources, roles)),
    ...findPreferenceProblems(sources, roles),
  ];
}
