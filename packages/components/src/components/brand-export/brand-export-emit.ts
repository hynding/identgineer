import type { BrandTheme } from "@identgineer/brand";
import { emitBrandTheme } from "@identgineer/brand/emit";
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
 * The theme is read once into a plain object, which `emitBrandTheme` regenerates once and writes
 * both texts from, so neither a getter on the theme nor one nested in its kit or its document can
 * give a stylesheet of one theme and tokens of another. The cast is only to hand it the value; it,
 * and not the type, decides whether it is a theme.
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
    return emitBrandTheme(snapshot);
  } catch {
    return undefined;
  }
}

/** Why a theme that gave no files gave none: it names no kit to emit from, or it fails the kit's. */
export function emitFailure(theme: unknown): "no-kit" | "altered" {
  const kit = ownValue(theme, "kit");
  return typeof kit === "object" && kit !== null ? "altered" : "no-kit";
}
