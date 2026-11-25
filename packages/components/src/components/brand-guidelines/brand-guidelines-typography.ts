import { FONT_PAIRINGS } from "@identgineer/brand/presets";
import { ownValue } from "../../utils/own-value";

type Pairing = (typeof FONT_PAIRINGS)[number];

export interface GuideFace {
  /** The family names of the stack, in order, as text. */
  readonly families: readonly string[];
  /** The stack as a `font-family` value, built from names that passed the check. */
  readonly stack: string;
  readonly weight: number | undefined;
  readonly letterSpacing: string | undefined;
  readonly lineHeight: number | undefined;
}

export interface GuideTypography {
  readonly label: string;
  readonly heading: GuideFace;
  readonly body: GuideFace;
}

// The pairings are the brand package's own constants, which a kit can only name by id, so nothing
// of a kit's text reaches a stack. The names are checked all the same, because a stack is the one
// place a family name could close a string and start a declaration.
const FAMILY_NAME = /^[A-Za-z][A-Za-z0-9 _-]{0,39}$/;
const BARE_NAME = /^[A-Za-z0-9_-]+$/;
const LETTER_SPACING = /^-?\d{1,2}(?:\.\d{1,3})?em$/;
const MIN_WEIGHT = 100;
const MAX_WEIGHT = 900;
const MIN_LINE_HEIGHT = 0.5;
const MAX_LINE_HEIGHT = 3;

function quoted(name: string): string {
  return BARE_NAME.test(name) ? name : `"${name}"`;
}

function weightOf(value: unknown): number | undefined {
  return Number.isInteger(value) &&
    (value as number) >= MIN_WEIGHT &&
    (value as number) <= MAX_WEIGHT
    ? (value as number)
    : undefined;
}

function lineHeightOf(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_LINE_HEIGHT &&
    value <= MAX_LINE_HEIGHT
    ? value
    : undefined;
}

function letterSpacingOf(value: unknown): string | undefined {
  return typeof value === "string" && LETTER_SPACING.test(value) ? value : undefined;
}

function face(
  families: readonly string[],
  weight: unknown,
  spacing: unknown,
  height: unknown,
): GuideFace {
  const names = families.filter((name) => FAMILY_NAME.test(name));
  return {
    families: names,
    stack: names.map(quoted).join(", "),
    weight: weightOf(weight),
    letterSpacing: letterSpacingOf(spacing),
    lineHeight: lineHeightOf(height),
  };
}

function pairingOf(kit: unknown): Pairing | undefined {
  const id = ownValue(kit, "typography");
  return FONT_PAIRINGS.find((pairing) => pairing.id === id);
}

/** The kit's font pairing, from the brand package's list: the families, weight and spacing of each face. */
export function readTypography(kit: unknown): GuideTypography | undefined {
  const pairing = pairingOf(kit);
  if (pairing === undefined) return undefined;
  return {
    label: pairing.label,
    heading: face(
      pairing.display,
      pairing.displayWeight,
      pairing.displayLetterSpacing,
      pairing.displayLineHeight,
    ),
    body: face(pairing.body, undefined, pairing.bodyLetterSpacing, pairing.bodyLineHeight),
  };
}
