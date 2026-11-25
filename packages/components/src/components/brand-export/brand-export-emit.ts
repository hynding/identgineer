/* eslint-disable @typescript-eslint/no-unused-vars -- a stub the next commit replaces */
import type { BrandTheme } from "@identgineer/brand";
import { emitBrandThemeCss, emitBrandThemeTokens } from "@identgineer/brand/emit";

export interface EmittedTheme {
  readonly css: string;
  readonly tokens: string;
  /** The id both texts are scoped to. */
  readonly id: string;
}

/**
 * The stylesheet and the token source of a theme, written by the brand package's own emitters, or
 * nothing when it cannot: they regenerate the theme from its kit, which they validate, and refuse
 * one whose document or radii differ, so a theme altered after it was generated, one that is not a
 * theme and one whose reads throw all give nothing here. The cast is only to hand them the value;
 * they, and not the type, are what decides whether it is one.
 */
export function emitTheme(theme: unknown): EmittedTheme | undefined {
  try {
    if (typeof theme !== "object" || theme === null) return undefined;
    const candidate = theme as BrandTheme;
    return { css: emitBrandThemeCss(candidate), tokens: emitBrandThemeTokens(candidate), id: "" };
  } catch {
    return undefined;
  }
}

/** Why a theme gave no files. A stub the next commit replaces. */
export function emitFailure(_theme: unknown): "no-kit" | "altered" {
  return "altered";
}
