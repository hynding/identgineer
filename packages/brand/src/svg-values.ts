import { trimXmlWhitespace, XML_WHITESPACE } from "./svg-characters.ts";
import { parseSvgColour } from "./svg-colour.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { normaliseNumber, noteRoundingError } from "./svg-number.ts";
import { parseSvgNumberList, parseSvgPathData } from "./svg-path-data.ts";
import { parseSvgTransform } from "./svg-transform.ts";

/**
 * A value that passed its grammar: canonical text built from what was parsed, or a reference to
 * an id in the same document (written back once ids are renamed).
 */
export type SvgValue =
  | {
      readonly text: string;
      /**
       * How far rounding to six decimals moved the value's numbers (or, for an arc, the shape they
       * draw), in the units they are written in; absent where nothing rounded.
       */
      readonly roundingError?: number;
      /** A transform list that rounding changed, with its numbers exactly as written. */
      readonly exactTransform?: string;
    }
  | { readonly reference: string; readonly form: "url" | "fragment" };

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
  // A negative number Chromium takes as an error, even one that rounds to zero.
  if (!allowNegative && Number(amount) < 0) return undefined;
  const normalised = normaliseNumber(amount, limits);
  if (normalised === undefined || (!allowNegative && normalised.startsWith("-"))) return undefined;
  return normalised + (unit === "px" ? "" : unit);
}

/**
 * A number of CSS pixels from a length in an absolute unit (or none), as written out and exactly, as
 * a browser takes it before any rounding; `undefined` otherwise.
 */
export function absolutePixels(
  input: string,
  limits: SvgLogoLimits,
): { readonly text: string; readonly exact: number } | undefined {
  const { amount, unit } = splitUnit(input);
  const factor = Object.hasOwn(ABSOLUTE_UNITS, unit) ? ABSOLUTE_UNITS[unit] : undefined;
  const normalised = factor === undefined ? undefined : normaliseNumber(amount, limits);
  if (factor === undefined || normalised === undefined || Number(normalised) <= 0) return undefined;
  const exact = Number(amount) * factor;
  if (factor === 1) return { text: normalised, exact };
  const text = normaliseNumber(exact.toFixed(limits.fractionDigits), limits);
  return text === undefined ? undefined : { text, exact };
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
 * read from the view box); a number that is zero or less, or rounds to zero, in any other unit,
 * which Chromium draws at no size (`no-size`); a positive one in a unit of the viewport, which an
 * image has none of (`viewport`); anything else, which Chromium reads as CSS (a calculation, a
 * variable, a keyword, a unit the sanitiser does not take) in ways it does not (`unread`).
 */
export function rootSizeProblem(
  input: string,
  limits: SvgLogoLimits,
): "no-size" | "viewport" | "unread" | undefined {
  const match = NUMBER_AND_UNIT.exec(trimXmlWhitespace(input));
  if (match === null) return "unread";
  const unit = (match[2] ?? "").toLowerCase();
  if (unit === "%") return undefined;
  const amount = Number(match[1]);
  if (amount <= 0 || amount < 10 ** -limits.fractionDigits / 2) return "no-size";
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
  const scaled = unit === "%" ? normaliseNumber(`${normalised}e-2`, limits) : normalised;
  return scaled === undefined ? undefined : clampUnit(scaled);
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
  return parsed === undefined ? undefined : text(parsed);
};

const nonNegativeLength: SvgGrammar = (input, limits) => {
  const parsed = length(input, limits, false);
  return parsed === undefined ? undefined : text(parsed);
};

const unitInterval: SvgGrammar = (input, limits) => {
  const parsed = fraction(input, limits);
  return parsed === undefined ? undefined : text(parsed);
};

const miterLimit: SvgGrammar = (input, limits) => {
  const parsed = number(input, limits);
  return parsed === undefined || Number(parsed) < 1 ? undefined : text(parsed);
};

const pathData: SvgGrammar = (input, limits) => {
  const parsed = parseSvgPathData(input, limits);
  return parsed === undefined ? undefined : text(parsed);
};

const points: SvgGrammar = (input, limits) => {
  const values = parseSvgNumberList(input, limits);
  if (values === undefined || values.length < 2 || values.length % 2 !== 0) return undefined;
  const pairs: string[] = [];
  for (let index = 0; index < values.length; index += 2) {
    pairs.push(`${values[index] ?? ""},${values[index + 1] ?? ""}`);
  }
  return text(pairs.join(" "));
};

const viewBox: SvgGrammar = (input, limits) => {
  const values = parseSvgNumberList(input, limits);
  if (values?.length !== 4 || Number(values[2]) <= 0 || Number(values[3]) <= 0) return undefined;
  return text(values.join(" "));
};

const dashArray: SvgGrammar = (input, limits) => {
  if (trimXmlWhitespace(input) === "none") return text("none");
  const parts = trimXmlWhitespace(input).split(LIST_SEPARATOR);
  if (parts.length > 64) return undefined;
  const lengths = parts.map((part) => length(part, limits, false, DASH_UNITS));
  if (lengths.some((part) => part === undefined)) return undefined;
  // What rounding moves a dash by, one repeat on: every length's change before it, an odd list
  // read twice over. Where every length rounds to zero the stroke is drawn solid, however short
  // the dashes were: no shift bounds that.
  const changes = parts.map((part, index) =>
    Math.abs(Number(splitUnit(part).amount) - Number(splitUnit(lengths[index] ?? "").amount)),
  );
  const written = lengths.some((part) => Number(splitUnit(part ?? "").amount) !== 0);
  const given = parts.some((part) => Number(splitUnit(part).amount) !== 0);
  const perRepeat = changes.reduce((sum, change) => sum + change, 0) * ((parts.length % 2) + 1);
  noteRoundingError(given && !written ? Infinity : perRepeat);
  return text(lengths.join(" "));
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
  if (parsed === undefined) return undefined;
  return parsed.exact === parsed.text
    ? text(parsed.text)
    : { text: parsed.text, exactTransform: parsed.exact };
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
