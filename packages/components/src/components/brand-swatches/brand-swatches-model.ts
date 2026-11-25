import { contrastRatio } from "@identgineer/tokens/contrast";
import {
  SWATCH_GROUPS,
  SWATCH_PAIRS,
  type SwatchGroupId,
  type SwatchPairDefinition,
} from "./brand-swatches-roles";

export const SWATCH_SCHEMES = ["light", "dark"] as const;
export type SwatchScheme = (typeof SWATCH_SCHEMES)[number];

/** The only colour format the brand package writes: six lower case hex digits. */
const OWN_COLOUR = /^#[0-9a-f]{6}$/;

/** A role's colour as a value of the brand package's theme document, or nothing. */
function colourOf(colours: unknown, role: string): string | undefined {
  if (typeof colours !== "object" || colours === null || !Object.hasOwn(colours, role)) {
    return undefined;
  }
  const token = (colours as Record<string, unknown>)[role];
  if (typeof token !== "object" || token === null || !Object.hasOwn(token, "$value")) {
    return undefined;
  }
  const value = (token as { $value?: unknown }).$value;
  return typeof value === "string" && OWN_COLOUR.test(value) ? value : undefined;
}

function schemeColours(palette: unknown, scheme: SwatchScheme): ReadonlyMap<string, string> {
  const colours = new Map<string, string>();
  const source = (palette as Partial<Record<SwatchScheme, { color?: unknown } | null>> | null)?.[
    scheme
  ];
  const group = source?.color;
  for (const { roles } of SWATCH_GROUPS) {
    for (const role of roles) {
      const value = colourOf(group, role);
      if (value !== undefined) colours.set(role, value);
    }
  }
  return colours;
}

/**
 * The colours of both schemes from what `generateBrandTheme` returned, or from its `document`.
 * Only the known roles are read and only a value in the package's own format is kept (`#rrggbb`),
 * so nothing else the data holds, a key or a value, goes any further. Anything unreadable, a
 * getter that throws included, gives no colours.
 */
export function readSwatchColours(
  theme: unknown,
): Record<SwatchScheme, ReadonlyMap<string, string>> {
  try {
    const document = (theme as { document?: unknown } | null | undefined)?.document;
    const palette = typeof document === "object" && document !== null ? document : theme;
    return { light: schemeColours(palette, "light"), dark: schemeColours(palette, "dark") };
  } catch {
    return { light: new Map(), dark: new Map() };
  }
}

export interface SwatchPair {
  /** The role the foreground sits on. */
  readonly background: string;
  readonly minimum: SwatchPairDefinition["minimum"];
  readonly ratio: number;
  readonly passes: boolean;
}

export interface Swatch {
  readonly role: string;
  readonly value: string;
  /** The pairs this colour is the foreground of. */
  readonly pairs: readonly SwatchPair[];
}

export interface SwatchGroup {
  readonly id: SwatchGroupId;
  readonly swatches: readonly Swatch[];
}

function pairsOf(role: string, colours: ReadonlyMap<string, string>): SwatchPair[] {
  const foreground = colours.get(role);
  if (foreground === undefined) return [];
  return SWATCH_PAIRS.flatMap((pair) => {
    const background = colours.get(pair.background);
    if (pair.foreground !== role || background === undefined) return [];
    const ratio = contrastRatio(foreground, background);
    return [
      { background: pair.background, minimum: pair.minimum, ratio, passes: ratio >= pair.minimum },
    ];
  });
}

/** The swatches of one scheme by group, leaving out each role with no colour and each empty group. */
export function buildSwatchGroups(colours: ReadonlyMap<string, string>): SwatchGroup[] {
  return SWATCH_GROUPS.flatMap(({ id, roles }) => {
    const swatches = roles.flatMap((role): Swatch[] => {
      const value = colours.get(role);
      return value === undefined ? [] : [{ role, value, pairs: pairsOf(role, colours) }];
    });
    return swatches.length === 0 ? [] : [{ id, swatches }];
  });
}

/**
 * A contrast ratio as text, rounded down to two decimals: a ratio of 4.496 must not read as the
 * 4.5 it is below.
 */
export function contrastText(ratio: number, format: (value: number) => string): string {
  return format(Math.floor(ratio * 100) / 100);
}
