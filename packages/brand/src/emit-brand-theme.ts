import {
  attributeSelector,
  emitDeclarationRule,
  emitStylesheet,
  emitThemeCss,
  flattenTokens,
  mergeTokens,
  parseTheme,
  resolveThemeScheme,
  SHARED_SOURCES,
  withAccentEdge,
  type ResolvedToken,
} from "@identgineer/tokens/theme-pipeline";
import { RADIUS_NAMES } from "./corner-radii.ts";
import { generateBrandTheme, type BrandTheme } from "./generate-brand-theme.ts";

const SHARED = mergeTokens(...SHARED_SOURCES.map(({ file, json }) => flattenTokens(file, json)));

// Characters that would let JSON break out of an HTML <script> element or a JavaScript string.
const HTML_UNSAFE_JSON = /[<>&\u2028\u2029]/g;

/**
 * The theme generated again from its kit (which generation re-validates), refusing one whose
 * document or radii no longer match: emission only ever writes values built from parsed numbers
 * and allowlisted constants, never anything set on the object afterwards.
 */
function regenerate(theme: BrandTheme): BrandTheme {
  const fresh = generateBrandTheme(theme.kit);
  const same =
    fresh.id === theme.id &&
    JSON.stringify(fresh.document) === JSON.stringify(theme.document) &&
    JSON.stringify(fresh.radius) === JSON.stringify(theme.radius);
  if (!same)
    throw new Error("brand theme was altered after generation; generate it again from its kit");
  return fresh;
}

// Named so the tokens package's emitter writes brandRadiusVariableName(name), the preference a
// design that follows brand corners reads.
function radiusPreferences(theme: BrandTheme, source: string): ResolvedToken[] {
  return RADIUS_NAMES.map((name) => ({
    path: `brand.radius.${name}`,
    type: "dimension",
    value: theme.radius[name],
    description: undefined,
    source,
  }));
}

/**
 * The theme as a stylesheet scoped exactly like a built-in theme file (`[data-theme="<id>"]`, with
 * the same `data-scheme` and `prefers-color-scheme` handling, written by the tokens package's own
 * emitter), followed by the corner radii in the `idg.brand` layer as a preference: designs that
 * follow brand corners resolve their radii through it, and designs that decline never read it.
 */
export function emitBrandThemeCss(theme: BrandTheme): string {
  const trusted = regenerate(theme);
  const file = `brand/${trusted.id}.json`;
  const parsed = parseTheme({ id: trusted.id, file, json: trusted.document });
  const themeBody = emitThemeCss({
    id: trusted.id,
    isDefault: false,
    light: withAccentEdge(resolveThemeScheme(SHARED, parsed, "light")),
    dark: withAccentEdge(resolveThemeScheme(SHARED, parsed, "dark")),
  });
  const brandBody = [
    "@layer idg.brand {",
    emitDeclarationRule(
      [attributeSelector("data-theme", trusted.id)],
      radiusPreferences(trusted, file),
      1,
    ),
    "}",
    "",
  ].join("\n");
  return emitStylesheet(themeBody, brandBody);
}

/** The theme as a DTCG theme source, formatted, with HTML-significant characters escaped. */
export function emitBrandThemeTokens(theme: BrandTheme): string {
  const json = JSON.stringify(regenerate(theme).document, null, 2);
  const escaped = json.replace(
    HTML_UNSAFE_JSON,
    (character) => `\\u${(character.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`,
  );
  return `${escaped}\n`;
}

/** What `emitBrandTheme` returns: both texts, and the id they are both scoped to. */
export interface EmittedBrandTheme {
  readonly css: string;
  readonly tokens: string;
  readonly id: string;
}

/** A stub the next commit replaces. */
export function emitBrandTheme(theme: BrandTheme): EmittedBrandTheme {
  return {
    css: emitBrandThemeCss(theme),
    tokens: emitBrandThemeTokens(theme),
    id: theme.id,
  };
}
