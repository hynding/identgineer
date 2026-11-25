import { trimXmlWhitespace, XML_WHITESPACE } from "./svg-characters.ts";
import { parseSvgColour } from "./svg-colour.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { normaliseNumber } from "./svg-number.ts";
import { parseSvgNumberList, parseSvgPathData } from "./svg-path-data.ts";
import { parseSvgTransform } from "./svg-transform.ts";

/**
 * A value that passed its grammar, or a reference to an id in the same document (written back once
 * ids are renamed). `text` is the value as the sanitiser reads it: numbers in one plain decimal
 * form, exactly (see `normaliseNumber`), lengths in lower case with no `px`, a fraction as a number
 * from 0 to 1. A value holding numbers is written out as `written`, exactly as it was given but for
 * its white space: so Chromium reads the same numbers from the output as from the original, however
 * its own number readers round them.
 */
export type SvgValue =
  | {
      readonly text: string;
      /** The value as given, trimmed, each tab, line feed and carriage return a space. */
      readonly written?: string;
    }
  | { readonly reference: string; readonly form: "url" | "fragment" };

/** What a value is written out as: as given where it holds numbers, else its own text. */
export function writtenText(value: { readonly text: string; readonly written?: string }): string {
  return value.written ?? value.text;
}

export type SvgGrammar = (input: string, limits: SvgLogoLimits) => SvgValue | undefined;

/** Ids the sanitiser keeps until it renames them: a letter or underscore, then word characters. */
export const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
// url(#id), the id optionally quoted, with white space allowed inside the parentheses.
const URL_REFERENCE = new RegExp(
  `^url\\(${XML_WHITESPACE}*(["']?)#([A-Za-z_][A-Za-z0-9_-]{0,63})\\1${XML_WHITESPACE}*\\)$`,
);
// White space with at most one comma in it: Chromium takes no list with two commas in a row.
const LIST_SEPARATOR = new RegExp(`${XML_WHITESPACE}+(?:,${XML_WHITESPACE}*)?|,${XML_WHITESPACE}*`);
const WHITESPACE_RUN = new RegExp(`${XML_WHITESPACE}+`);
/**
 * The units a kept length may carry, a pixel being written bare. No em or ex: inline, they would
 * take the page's font size, so neither the drawing nor its cost would be the logo's own. The cost
 * model is total over exactly these, so a unit added here must be added there.
 */
export type SvgLengthUnit = "" | "%" | "mm" | "cm" | "in" | "pt" | "pc";
/** A dash takes no percentage, so its length, and so the dash count, is known. */
type SvgDashUnit = Exclude<SvgLengthUnit, "%">;
const LENGTH_UNITS: ReadonlySet<SvgLengthUnit | "px"> = new Set<SvgLengthUnit | "px">([
  "",
  "px",
  "%",
  "mm",
  "cm",
  "in",
  "pt",
  "pc",
]);
const DASH_UNITS: ReadonlySet<SvgDashUnit | "px"> = new Set<SvgDashUnit | "px">([
  "",
  "px",
  "mm",
  "cm",
  "in",
  "pt",
  "pc",
]);
const ABSOLUTE_UNITS: Readonly<Record<string, number>> = {
  "": 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
};

const text = (value: string): SvgValue => ({ text: value });

// White space XML keeps in a value, which the output writes as spaces: a line feed written out would
// be read back as a space, and every grammar that takes numbers takes any white space alike.
const WHITESPACE_CHARACTER = /[\t\n\r]/g;

/** A value read as `read`, to be written out as `input` was given. */
function asGiven(input: string, read: string): SvgValue {
  const written = trimXmlWhitespace(input).replace(WHITESPACE_CHARACTER, " ");
  return written === read ? { text: read } : { text: read, written };
}

function number(input: string, limits: SvgLogoLimits): string | undefined {
  return normaliseNumber(trimXmlWhitespace(input), limits);
}

function splitUnit(input: string): { amount: string; unit: string } {
  const value = trimXmlWhitespace(input);
  // A number ends in a digit or a point, so two trailing letters (or a percent sign) are a unit;
  // an exponent such as `e5` ends in a digit and is never taken for one.
  const match = /(%|[a-zA-Z]{2})$/.exec(value);
  return match
    ? { amount: value.slice(0, match.index), unit: match[0].toLowerCase() }
    : { amount: value, unit: "" };
}

function length(
  input: string,
  limits: SvgLogoLimits,
  allowNegative: boolean,
  units: ReadonlySet<SvgLengthUnit | "px"> = LENGTH_UNITS,
): string | undefined {
  const { amount, unit } = splitUnit(input);
  if (!(units as ReadonlySet<string>).has(unit)) return undefined;
  const normalised = normaliseNumber(amount, limits);
  // A negative number Chromium takes as an error, `-0` aside.
  if (normalised === undefined || (!allowNegative && normalised.startsWith("-"))) return undefined;
  return normalised + (unit === "px" ? "" : unit);
}

/**
 * A positive length in an absolute unit (or none), read as the number of CSS pixels it is and
 * written out as given; `undefined` otherwise.
 */
export function absolutePixels(input: string, limits: SvgLogoLimits): SvgValue | undefined {
  const { amount, unit } = splitUnit(input);
  const factor = Object.hasOwn(ABSOLUTE_UNITS, unit) ? ABSOLUTE_UNITS[unit] : undefined;
  const normalised = factor === undefined ? undefined : normaliseNumber(amount, limits);
  if (factor === undefined || normalised === undefined || Number(normalised) <= 0) return undefined;
  if (factor === 1) return asGiven(input, normalised);
  const pixels = normaliseNumber(String(Number(normalised) * factor), limits);
  return pixels === undefined ? undefined : asGiven(input, pixels);
}

// Units of the viewport, which an image has none of: Chromium draws a root sized in them at no size.
const VIEWPORT_UNITS: ReadonlySet<string> = new Set([
  "vw",
  "vh",
  "vi",
  "vb",
  "vmin",
  "vmax",
  "svw",
  "svh",
  "svi",
  "svb",
  "svmin",
  "svmax",
  "lvw",
  "lvh",
  "lvi",
  "lvb",
  "lvmin",
  "lvmax",
  "dvw",
  "dvh",
  "dvi",
  "dvb",
  "dvmin",
  "dvmax",
  "cqw",
  "cqh",
  "cqi",
  "cqb",
  "cqmin",
  "cqmax",
]);
const NUMBER_AND_UNIT = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(%|[a-zA-Z]*)$/;

/**
 * What is wrong with a root width or height that is not a positive length in an absolute unit (or
 * none): a percentage, which an image takes as no size given (`undefined`: dropped, and the size
 * read from the view box); a number that is zero or less, or too small for Chromium to read as more,
 * in any other unit, which Chromium draws at no size (`no-size`); a positive one in a unit of the viewport, which an
 * image has none of (`viewport`); anything else, which Chromium reads as CSS (a calculation, a
 * variable, a keyword, a unit the sanitiser does not take) in ways it does not (`unread`).
 */
export function rootSizeProblem(input: string): "no-size" | "viewport" | "unread" | undefined {
  const match = NUMBER_AND_UNIT.exec(trimXmlWhitespace(input));
  if (match === null) return "unread";
  const unit = (match[2] ?? "").toLowerCase();
  if (unit === "%") return undefined;
  const amount = Number(match[1]);
  // Chromium reads a length past single precision's smallest, `1e-39`, as zero.
  if (amount < 1e-38) return "no-size";
  return VIEWPORT_UNITS.has(unit) ? "viewport" : "unread";
}

function clampUnit(normalised: string): string {
  const value = Number(normalised);
  return value < 0 ? "0" : value > 1 ? "1" : normalised;
}

function fraction(input: string, limits: SvgLogoLimits): string | undefined {
  const { amount, unit } = splitUnit(input);
  if (unit !== "" && unit !== "%") return undefined;
  const normalised = normaliseNumber(amount, limits);
  if (normalised === undefined) return undefined;
  // The value read exactly, a percentage as a hundredth of it, then clamped as Chromium clamps it.
  return clampUnit(unit === "%" ? hundredth(normalised) : normalised);
}

/** A plain decimal divided by 100, exactly. */
function hundredth(decimal: string): string {
  const negative = decimal.startsWith("-");
  const [whole = "0", fractionDigits = ""] = decimal.replace("-", "").split(".");
  const digits = whole.padStart(3, "0") + fractionDigits;
  const point = digits.length - fractionDigits.length - 2;
  const integer = digits.slice(0, point).replace(/^0+(?=\d)/, "");
  const rest = digits.slice(point).replace(/0+$/, "");
  const value = rest === "" ? integer : `${integer}.${rest}`;
  return negative && value !== "0" ? `-${value}` : value;
}

function urlReference(input: string): SvgValue | undefined {
  const id = URL_REFERENCE.exec(trimXmlWhitespace(input))?.[2];
  return id === undefined ? undefined : { reference: id, form: "url" };
}

/** A keyword of a CSS property, which CSS reads with white space around it. */
const enumeration =
  (...choices: readonly string[]): SvgGrammar =>
  (input) => {
    const value = trimXmlWhitespace(input);
    return choices.includes(value) ? text(value) : undefined;
  };

/** A keyword of an attribute that is no CSS property: Chromium takes it exactly as written. */
const keyword =
  (...choices: readonly string[]): SvgGrammar =>
  (input) =>
    choices.includes(input) ? text(input) : undefined;

const paint: SvgGrammar = (input) => {
  const value = trimXmlWhitespace(input);
  if (value === "none") return text("none");
  if (value.startsWith("url(")) return urlReference(value);
  const colour = parseSvgColour(value);
  return colour === undefined ? undefined : text(colour);
};

const noneOrReference: SvgGrammar = (input) =>
  trimXmlWhitespace(input) === "none" ? text("none") : urlReference(input);

const colour: SvgGrammar = (input) => {
  const parsed = parseSvgColour(input);
  return parsed === undefined ? undefined : text(parsed);
};

const anyLength: SvgGrammar = (input, limits) => {
  const parsed = length(input, limits, true);
  return parsed === undefined ? undefined : asGiven(input, parsed);
};

const nonNegativeLength: SvgGrammar = (input, limits) => {
  const parsed = length(input, limits, false);
  return parsed === undefined ? undefined : asGiven(input, parsed);
};

const unitInterval: SvgGrammar = (input, limits) => {
  const parsed = fraction(input, limits);
  return parsed === undefined ? undefined : asGiven(input, parsed);
};

const miterLimit: SvgGrammar = (input, limits) => {
  const parsed = number(input, limits);
  return parsed === undefined || Number(parsed) < 1 ? undefined : asGiven(input, parsed);
};

const pathData: SvgGrammar = (input, limits) => {
  const parsed = parseSvgPathData(input, limits);
  return parsed === undefined ? undefined : asGiven(input, parsed);
};

const points: SvgGrammar = (input, limits) => {
  const values = parseSvgNumberList(input, limits);
  if (values === undefined || values.length < 2 || values.length % 2 !== 0) return undefined;
  const pairs: string[] = [];
  for (let index = 0; index < values.length; index += 2) {
    pairs.push(`${values[index] ?? ""},${values[index + 1] ?? ""}`);
  }
  return asGiven(input, pairs.join(" "));
};

const viewBox: SvgGrammar = (input, limits) => {
  const values = parseSvgNumberList(input, limits);
  if (values?.length !== 4 || Number(values[2]) <= 0 || Number(values[3]) <= 0) return undefined;
  return asGiven(input, values.join(" "));
};

const dashArray: SvgGrammar = (input, limits) => {
  if (trimXmlWhitespace(input) === "none") return text("none");
  const parts = trimXmlWhitespace(input).split(LIST_SEPARATOR);
  if (parts.length > 64) return undefined;
  const lengths = parts.map((part) => length(part, limits, false, DASH_UNITS));
  if (lengths.some((part) => part === undefined)) return undefined;
  return asGiven(input, lengths.join(" "));
};

// Either `normal` or the layers named first, each once; the ones left out follow in their usual order.
const paintOrder: SvgGrammar = (input) => {
  const value = trimXmlWhitespace(input);
  if (value === "normal") return text("normal");
  const layers = value.split(WHITESPACE_RUN);
  const known = layers.every((layer) => ["fill", "stroke", "markers"].includes(layer));
  return known && new Set(layers).size === layers.length ? text(layers.join(" ")) : undefined;
};

const transform: SvgGrammar = (input, limits) => {
  const parsed = parseSvgTransform(input, limits);
  return parsed === undefined ? undefined : asGiven(input, parsed);
};

const ALIGNMENTS = ["xMin", "xMid", "xMax"].flatMap((x) =>
  ["YMin", "YMid", "YMax"].map((y) => x + y),
);

export interface AspectRatio {
  readonly align: string;
  readonly meet: string;
}

/** A `preserveAspectRatio` as SVG reads it: an alignment or `none`, then `meet` or `slice`. */
export function aspectRatio(input: string): AspectRatio | undefined {
  const parts = trimXmlWhitespace(input).split(WHITESPACE_RUN);
  const [align, meet = "meet"] = parts;
  if (parts.length > 2 || align === undefined) return undefined;
  if (align !== "none" && !ALIGNMENTS.includes(align)) return undefined;
  if (meet !== "meet" && meet !== "slice") return undefined;
  return { align, meet };
}

/**
 * Whether a valid `preserveAspectRatio` stretches the view box (`none`) or crops it (`slice`):
 * either can spread a thin view box over the whole image, painting far more than its larger side's
 * square, so neither is kept and the logo is drawn to fit, as it is by default.
 */
export function stretchesOrCrops(input: string): boolean {
  const parsed = aspectRatio(input);
  return parsed !== undefined && (parsed.align === "none" || parsed.meet === "slice");
}

const preserveAspectRatio: SvgGrammar = (input) => {
  if (aspectRatio(input) === undefined || stretchesOrCrops(input)) return undefined;
  return text(trimXmlWhitespace(input).split(WHITESPACE_RUN).join(" "));
};

// Exactly `#id`: Chromium does not resolve a reference with white space around it as an image.
const fragment: SvgGrammar = (input) => {
  const id = input.slice(1);
  return input.startsWith("#") && ID_PATTERN.test(id)
    ? { reference: id, form: "fragment" }
    : undefined;
};

const id: SvgGrammar = (input) => (ID_PATTERN.test(input) ? text(input) : undefined);

/**
 * The grammar of every attribute and style property the sanitiser keeps, by name. An attribute
 * means the same on every element that allows it, so one table serves them all.
 */
export const SVG_GRAMMARS: Readonly<Record<string, SvgGrammar>> = {
  id,
  // Geometry.
  d: pathData,
  points,
  x: anyLength,
  y: anyLength,
  width: nonNegativeLength,
  height: nonNegativeLength,
  rx: nonNegativeLength,
  ry: nonNegativeLength,
  cx: anyLength,
  cy: anyLength,
  r: nonNegativeLength,
  fx: anyLength,
  fy: anyLength,
  fr: nonNegativeLength,
  x1: anyLength,
  y1: anyLength,
  x2: anyLength,
  y2: anyLength,
  viewBox,
  preserveAspectRatio,
  transform,
  gradientTransform: transform,
  offset: unitInterval,
  // References.
  href: fragment,
  "clip-path": noneOrReference,
  mask: noneOrReference,
  // Paint and presentation.
  fill: paint,
  stroke: paint,
  color: colour,
  "stop-color": colour,
  "fill-opacity": unitInterval,
  "stroke-opacity": unitInterval,
  "stop-opacity": unitInterval,
  opacity: unitInterval,
  "fill-rule": enumeration("nonzero", "evenodd"),
  "clip-rule": enumeration("nonzero", "evenodd"),
  "stroke-width": nonNegativeLength,
  "stroke-linecap": enumeration("butt", "round", "square"),
  "stroke-linejoin": enumeration("miter", "round", "bevel"),
  "stroke-miterlimit": miterLimit,
  "stroke-dasharray": dashArray,
  "stroke-dashoffset": anyLength,
  "paint-order": paintOrder,
  display: enumeration("inline", "none"),
  visibility: enumeration("visible", "hidden", "collapse"),
  "shape-rendering": enumeration("auto", "optimizeSpeed", "crispEdges", "geometricPrecision"),
  gradientUnits: keyword("userSpaceOnUse", "objectBoundingBox"),
  spreadMethod: keyword("pad", "reflect", "repeat"),
  clipPathUnits: keyword("userSpaceOnUse", "objectBoundingBox"),
  maskUnits: keyword("userSpaceOnUse", "objectBoundingBox"),
  maskContentUnits: keyword("userSpaceOnUse", "objectBoundingBox"),
  // Figma writes `style="mask-type:alpha"`; without it an alpha mask is read for its luminance.
  "mask-type": enumeration("luminance", "alpha"),
};
