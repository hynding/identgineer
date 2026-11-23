import type { Scheme } from "@identgineer/tokens";
import { flattenTokens, ROLE_SOURCES } from "@identgineer/tokens/theme-pipeline";
import type { BrandKit, Corners, Tone } from "./brand-kit.ts";
import type { BrandRadius } from "./corner-radii.ts";
import { fontPairingFor, type TypographyId } from "./font-pairings.ts";
import type { SchemePalette } from "./generate-palette.ts";
import { formatHexColor } from "./srgb.ts";

interface Token<Value> {
  readonly $value: Value;
}

interface TypedToken<Type extends string, Value> extends Token<Value> {
  readonly $type: Type;
}

/** `{ "$type": "color", "<role>": { "$value": "#rrggbb" }, … }`, in the tokens' role order. */
export type ColorGroup = { readonly $type: "color" } & Readonly<
  Record<string, Token<string> | "color">
>;

export interface GradientStopDocument {
  readonly color: string;
  readonly position: number;
}

export interface SchemeDocument {
  readonly color: ColorGroup;
  readonly gradient: {
    readonly brand: TypedToken<"gradient", readonly GradientStopDocument[]>;
  };
}

export interface TypographyDocument {
  readonly font: {
    readonly family: {
      readonly $type: "fontFamily";
      readonly display: Token<readonly string[]>;
      readonly body: Token<readonly string[]>;
      readonly mono: Token<readonly string[]>;
    };
    readonly display: {
      readonly weight: TypedToken<"fontWeight", number>;
      readonly "letter-spacing": TypedToken<"dimension", string>;
      readonly "line-height": TypedToken<"number", number>;
    };
    readonly body: {
      readonly "letter-spacing": TypedToken<"dimension", string>;
      readonly "line-height": TypedToken<"number", number>;
    };
  };
}

export interface BrandRecord {
  readonly typography: TypographyId;
  readonly corners: Corners;
  readonly tone: Tone;
  readonly colors: {
    readonly primary: string;
    readonly secondary?: string;
    readonly neutralTint?: string;
  };
  /** The design-owned radii the corners set; emitted in the idg.brand layer, not the theme. */
  readonly radius: { readonly $type: "dimension" } & Readonly<
    Record<string, Token<string> | "dimension">
  >;
}

/**
 * The same DTCG shape as a built-in theme source (`common`, `light`, `dark`, label and
 * description), so the tokens package parses, verifies and emits it unchanged. What a theme may
 * not own (the radii) travels in `$extensions`, which the tokens pipeline ignores.
 */
export interface BrandThemeDocument {
  readonly $description: string;
  readonly $extensions: {
    readonly identgineer: { readonly label: string; readonly brand: BrandRecord };
  };
  readonly common: TypographyDocument;
  readonly light: SchemeDocument;
  readonly dark: SchemeDocument;
}

/** The colour roles the tokens package requires of every theme, in its order. */
export const COLOR_ROLES: readonly string[] = flattenTokens(
  ROLE_SOURCES.theme.file,
  ROLE_SOURCES.theme.json,
)
  .map((token) => token.path)
  .filter((path) => path.startsWith("color."))
  .map((path) => path.slice("color.".length));

function colorGroup(palette: SchemePalette, scheme: Scheme): ColorGroup {
  const extra = [...palette.colors.keys()].filter((role) => !COLOR_ROLES.includes(role));
  if (extra.length > 0)
    throw new Error(`brand palette: ${scheme} has unknown roles ${extra.join(", ")}`);
  const entries = COLOR_ROLES.map((role) => {
    const rgb = palette.colors.get(role);
    if (!rgb) throw new Error(`brand palette: ${scheme} scheme has no "${role}"`);
    return [role, { $value: formatHexColor(rgb) }] as const;
  });
  return { $type: "color", ...Object.fromEntries(entries) };
}

function schemeDocument(palette: SchemePalette, scheme: Scheme): SchemeDocument {
  const [start, end] = palette.gradient;
  return {
    color: colorGroup(palette, scheme),
    gradient: {
      brand: {
        $type: "gradient",
        $value: [
          { color: formatHexColor(start), position: 0 },
          { color: formatHexColor(end), position: 1 },
        ],
      },
    },
  };
}

function typographyDocument(typography: TypographyId): TypographyDocument {
  const pairing = fontPairingFor(typography);
  return {
    font: {
      family: {
        $type: "fontFamily",
        display: { $value: [...pairing.display] },
        body: { $value: [...pairing.body] },
        mono: { $value: [...pairing.mono] },
      },
      display: {
        weight: { $type: "fontWeight", $value: pairing.displayWeight },
        "letter-spacing": { $type: "dimension", $value: pairing.displayLetterSpacing },
        "line-height": { $type: "number", $value: pairing.displayLineHeight },
      },
      body: {
        "letter-spacing": { $type: "dimension", $value: pairing.bodyLetterSpacing },
        "line-height": { $type: "number", $value: pairing.bodyLineHeight },
      },
    },
  };
}

function brandRecord(kit: BrandKit, radius: BrandRadius): BrandRecord {
  const { primary, secondary, neutralTint } = kit.colors;
  return {
    typography: kit.typography,
    corners: kit.corners,
    tone: kit.tone,
    colors: {
      primary: formatHexColor(primary),
      ...(secondary && { secondary: formatHexColor(secondary) }),
      ...(neutralTint && { neutralTint: formatHexColor(neutralTint) }),
    },
    radius: {
      $type: "dimension",
      ...Object.fromEntries(
        Object.entries(radius).map(([name, value]) => [name, { $value: value }]),
      ),
    },
  };
}

export function buildThemeDocument(
  kit: BrandKit,
  palettes: Readonly<Record<Scheme, SchemePalette>>,
  radius: BrandRadius,
): BrandThemeDocument {
  return {
    $description: kit.tagline ?? `Brand theme for ${kit.name}`,
    $extensions: { identgineer: { label: kit.name, brand: brandRecord(kit, radius) } },
    common: typographyDocument(kit.typography),
    light: schemeDocument(palettes.light, "light"),
    dark: schemeDocument(palettes.dark, "dark"),
  };
}
