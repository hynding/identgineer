import { CORNER_RADII, CORNERS, RADIUS_NAMES, TONES } from "@identgineer/brand/presets";
import { displayText } from "../../utils/untrusted-text";
import { ownValue } from "../../utils/own-value";
import { BRAND_NAME_MAX_LENGTH } from "../brand-logo/brand-logo-options";
import {
  isOwnColour,
  readSwatchColours,
  SWATCH_SCHEMES,
  type SwatchScheme,
} from "../brand-swatches/brand-swatches-model";

/** The longest tagline a kit can have (`TAGLINE_MAX_LENGTH` of the brand package); more is cut. */
export const BRAND_TAGLINE_MAX_LENGTH = 120;

type CornerStyle = (typeof CORNERS)[number];
type Tone = (typeof TONES)[number];
type RadiusName = (typeof RADIUS_NAMES)[number];

export interface SourceColour {
  readonly role: "primary" | "secondary" | "neutralTint";
  readonly value: string;
}

/** The page, text and accent colours of one scheme: what a logo is judged against. */
export interface GuideBacking {
  readonly scheme: SwatchScheme;
  readonly background: string;
  readonly text: string;
  readonly accent: string;
  readonly onAccent: string;
}

export interface GuideGradient {
  readonly scheme: SwatchScheme;
  readonly stops: readonly { readonly colour: string; readonly percent: number }[];
  /** A `linear-gradient()` built from the validated stops and nothing else. */
  readonly value: string;
}

export interface GuideCorner {
  readonly name: RadiusName;
  readonly value: string;
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? displayText(value.trim(), limit) : "";
}

/** The kit's name as it is drawn: trimmed, cut at the kit's limit and with nothing invisible in it. */
export function readName(kit: unknown): string {
  return text(ownValue(kit, "name"), BRAND_NAME_MAX_LENGTH);
}

export function readTagline(kit: unknown): string {
  return text(ownValue(kit, "tagline"), BRAND_TAGLINE_MAX_LENGTH);
}

/**
 * The kit's logo or mark text, for the logo component to check. Whether it is the sanitiser's own
 * output is that component's decision, which it makes once the text is set.
 */
export function readImage(kit: unknown, field: "logo" | "mark"): string | undefined {
  const value = ownValue(kit, field);
  return typeof value === "string" ? value : undefined;
}

const SOURCE_ROLES = ["primary", "secondary", "neutralTint"] as const;
const BYTE_COUNT = 3;
const MAX_BYTE = 255;

function hexOfChannels(channels: unknown): string | undefined {
  try {
    if (!Array.isArray(channels) || channels.length !== BYTE_COUNT) return undefined;
    const bytes: unknown[] = [channels[0], channels[1], channels[2]];
    if (
      !bytes.every(
        (byte) => Number.isInteger(byte) && (byte as number) >= 0 && (byte as number) <= MAX_BYTE,
      )
    ) {
      return undefined;
    }
    return `#${(bytes as number[]).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return undefined;
  }
}

/** The colours the kit was made from, as hex, for each of them that is three whole channels. */
export function readSourceColours(kit: unknown): SourceColour[] {
  const colours = ownValue(kit, "colors");
  return SOURCE_ROLES.flatMap((role): SourceColour[] => {
    const value = hexOfChannels(ownValue(colours, role));
    return value === undefined ? [] : [{ role, value }];
  });
}

function paletteOf(theme: unknown): unknown {
  const document = ownValue(theme, "document");
  return typeof document === "object" && document !== null ? document : theme;
}

/** The backings: the brand's own page colour with its text and accent, where all four are valid. */
export function readBackings(theme: unknown): GuideBacking[] {
  const colours = readSwatchColours(theme);
  return SWATCH_SCHEMES.flatMap((scheme): GuideBacking[] => {
    const map = colours[scheme];
    const background = map.get("bg");
    const foreground = map.get("text");
    const accent = map.get("accent");
    const onAccent = map.get("on-accent");
    if (background === undefined || foreground === undefined) return [];
    if (accent === undefined || onAccent === undefined) return [];
    return [{ scheme, background, text: foreground, accent, onAccent }];
  });
}

const MIN_STOPS = 2;
const MAX_STOPS = 4;
// The angle the tokens package writes every gradient with, so a gradient drawn here is the one a
// page gets from the emitted stylesheet.
const GRADIENT_ANGLE = "135deg";

function percentOf(position: unknown): number | undefined {
  if (typeof position !== "number" || !Number.isFinite(position)) return undefined;
  if (position < 0 || position > 1) return undefined;
  return Number((position * 100).toFixed(2));
}

function readStops(value: unknown): GuideGradient["stops"] | undefined {
  try {
    if (!Array.isArray(value) || value.length < MIN_STOPS || value.length > MAX_STOPS) {
      return undefined;
    }
    const stops: { colour: string; percent: number }[] = [];
    for (const entry of value as unknown[]) {
      const colour = ownValue(entry, "color");
      const percent = percentOf(ownValue(entry, "position"));
      if (!isOwnColour(colour) || percent === undefined) return undefined;
      stops.push({ colour, percent });
    }
    return stops;
  } catch {
    return undefined;
  }
}

/** The brand gradient of each scheme that has a valid one: two to four stops of validated colours. */
export function readGradients(theme: unknown): GuideGradient[] {
  const palette = paletteOf(theme);
  return SWATCH_SCHEMES.flatMap((scheme): GuideGradient[] => {
    const gradient = ownValue(ownValue(ownValue(palette, scheme), "gradient"), "brand");
    const stops = readStops(ownValue(gradient, "$value"));
    if (stops === undefined) return [];
    const parts = stops.map((stop) => `${stop.colour} ${String(stop.percent)}%`);
    return [{ scheme, stops, value: `linear-gradient(${GRADIENT_ANGLE}, ${parts.join(", ")})` }];
  });
}

const RADIUS_VALUE = /^(\d{1,4}(?:\.\d{1,4})?)(?:rem|px)$/;

function radiusOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = RADIUS_VALUE.exec(value);
  return match !== null && Number.isFinite(Number(match[1])) ? value : undefined;
}

function oneOfList<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return list.find((candidate) => candidate === value);
}

/**
 * The corner style the kit names and the radii to draw: the theme's own where it carries them, else
 * the radii the style sets. A radius is kept only as a number of rem or px, and the names are the
 * four the brand package has.
 */
export function readCorners(
  kit: unknown,
  theme: unknown,
): { style: CornerStyle | undefined; radii: GuideCorner[] } {
  const style = oneOfList(CORNERS, ownValue(kit, "corners"));
  const own = ownValue(theme, "radius");
  const source: unknown = typeof own === "object" && own !== null ? own : undefined;
  const radii = RADIUS_NAMES.flatMap((name): GuideCorner[] => {
    const value = radiusOf(
      source !== undefined ? ownValue(source, name) : style && CORNER_RADII[style][name],
    );
    return value === undefined ? [] : [{ name, value }];
  });
  return { style, radii };
}

export function readTone(kit: unknown): Tone | undefined {
  return oneOfList(TONES, ownValue(kit, "tone"));
}
