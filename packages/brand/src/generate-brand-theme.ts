import type { Scheme } from "@identgineer/tokens";
import { findBrandIdProblem } from "./brand-id.ts";
import type { BrandKit } from "./brand-kit.ts";
import { buildThemeDocument, type BrandThemeDocument } from "./brand-theme-document.ts";
import { CORNER_RADII, type BrandRadius } from "./corner-radii.ts";
import { generatePalette, type BrandAdjustment, type SchemePalette } from "./generate-palette.ts";

export interface BrandTheme {
  /** The `data-theme` value. */
  readonly id: string;
  readonly kit: BrandKit;
  /** The theme as a DTCG theme source, accepted unchanged by the tokens pipeline. */
  readonly document: BrandThemeDocument;
  /** The `shape.radius.*` values the kit's corners set. */
  readonly radius: BrandRadius;
  /** Every colour moved to pass a contrast check, light scheme first. */
  readonly adjustments: readonly BrandAdjustment[];
}

/**
 * A complete light and dark theme from a parsed brand kit. Deterministic and total: every kit
 * `parseBrandKit` accepts gives a theme that passes the tokens contrast suite in both schemes.
 * Throws only for a hand-built kit whose id is not a valid brand id.
 */
export function generateBrandTheme(kit: BrandKit): BrandTheme {
  const problem = findBrandIdProblem(kit.id);
  if (problem) throw new TypeError(`not a valid brand id: ${problem.message}`);
  const palettes: Record<Scheme, SchemePalette> = {
    light: generatePalette(kit, "light"),
    dark: generatePalette(kit, "dark"),
  };
  const radius = CORNER_RADII[kit.corners];
  return {
    id: kit.id,
    kit,
    document: buildThemeDocument(kit, palettes, radius),
    radius,
    adjustments: [...palettes.light.adjustments, ...palettes.dark.adjustments],
  };
}
