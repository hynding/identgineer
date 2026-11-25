import {
  findContrastFailures,
  flattenTokens,
  formatContrastFailure,
  mergeTokens,
  parseTheme,
  resolveThemeScheme,
  ROLE_SOURCES,
  SHARED_SOURCES,
} from "@identgineer/tokens/theme-pipeline";
import type { Scheme } from "@identgineer/tokens";
import { expect } from "vitest";
import type { BrandKit } from "./brand-kit.ts";
import type { BrandTheme } from "./generate-brand-theme.ts";
import { isSanitisedSvgLogo } from "./is-sanitised-svg-logo.ts";
import { parseBrandKit } from "./parse-brand-kit.ts";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import { findSanitisedSvgProblems } from "./svg-output-check.ts";

// Test-only helpers: everything here goes through the tokens package's own functions, the ones the
// built-in themes are held to, rather than anything in this package.

export const SHARED = mergeTokens(
  ...SHARED_SOURCES.map(({ file, json }) => flattenTokens(file, json)),
);
export const SEMANTIC = flattenTokens(ROLE_SOURCES.theme.file, ROLE_SOURCES.theme.json);

export function kitFrom(overrides: Record<string, unknown> = {}): BrandKit {
  const result = parseBrandKit({
    id: "acme",
    name: "Acme",
    colors: { primary: "#4f46e5" },
    typography: "system",
    corners: "soft",
    tone: "balanced",
    ...overrides,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.kit;
}

export function parsedTheme(theme: BrandTheme) {
  return parseTheme({ id: theme.id, file: `brand/${theme.id}.json`, json: theme.document });
}

/** The colours the tokens resolver gives one scheme, keyed by role without `color.`. */
export function resolvedColors(theme: BrandTheme, scheme: Scheme): Map<string, string> {
  const colors = new Map<string, string>();
  for (const token of resolveThemeScheme(SHARED, parsedTheme(theme), scheme)) {
    if (token.type === "color" && typeof token.value === "string") {
      colors.set(token.path.replace(/^color\./, ""), token.value);
    }
  }
  return colors;
}

/** Every contrast failure the tokens suite finds, in both schemes, as its own messages. */
export function contrastProblems(theme: BrandTheme): string[] {
  return (["light", "dark"] as const).flatMap((scheme) =>
    findContrastFailures(resolvedColors(theme, scheme)).map((failure) =>
      formatContrastFailure(theme.id, scheme, failure),
    ),
  );
}

export function hueDistance(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/**
 * What every accepted logo must be: valid to the independent check, a fixed point of the sanitiser
 * (so `isSanitisedSvgLogo` and a kit take it), and no larger than an input may be.
 */
export function expectSettledLogo(svg: string, where: string, idPrefix?: string): void {
  expect(findSanitisedSvgProblems(svg), `${where}: valid`).toEqual([]);
  const again = sanitiseSvgLogo(svg, idPrefix === undefined ? undefined : { idPrefix });
  expect(again.ok && again.svg, `${where}: a fixed point`).toBe(svg);
  expect(isSanitisedSvgLogo(svg), `${where}: taken as sanitised`).toBe(true);
  expect(
    new TextEncoder().encode(svg).length,
    `${where}: within the input limit`,
  ).toBeLessThanOrEqual(SVG_LOGO_LIMITS.inputBytes);
}
