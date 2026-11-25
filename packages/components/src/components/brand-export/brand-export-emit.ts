import type { BrandTheme } from "@identgineer/brand";
import { emitBrandThemeCss, emitBrandThemeTokens } from "@identgineer/brand/emit";
import { ownValue } from "../../utils/own-value";

export interface EmittedTheme {
  readonly css: string;
  readonly tokens: string;
  /** The id both texts are scoped to, which the emitters checked against the kit. */
  readonly id: string;
}

/**
 * The stylesheet and the token source of a theme, written by the brand package's own emitters, or
 * nothing when it cannot: they regenerate the theme from its kit, which they validate, and refuse
 * one whose id, document or radii differ, so a theme altered after it was generated, one that is not
 * a theme and one whose reads throw all give nothing here.
 *
 * The theme is read once into a plain object that both emitters are given, so getters that answer
 * otherwise the second time cannot give a stylesheet of one theme and tokens of another. The cast
 * is only to hand them the value; they, and not the type, are what decides whether it is one.
 */
export function emitTheme(theme: unknown): EmittedTheme | undefined {
  try {
    if (typeof theme !== "object" || theme === null) return undefined;
    const snapshot = {
      id: ownValue(theme, "id"),
      kit: ownValue(theme, "kit"),
      document: ownValue(theme, "document"),
      radius: ownValue(theme, "radius"),
    } as BrandTheme;
    return {
      css: emitBrandThemeCss(snapshot),
      tokens: emitBrandThemeTokens(snapshot),
      id: snapshot.id,
    };
  } catch {
    return undefined;
  }
}

/** Why a theme that gave no files gave none: it names no kit to emit from, or it fails the kit's. */
export function emitFailure(theme: unknown): "no-kit" | "altered" {
  const kit = ownValue(theme, "kit");
  return typeof kit === "object" && kit !== null ? "altered" : "no-kit";
}
