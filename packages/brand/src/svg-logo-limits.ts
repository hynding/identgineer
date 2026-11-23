/**
 * Every bound the SVG logo sanitiser holds a document to. Going over any of them rejects the whole
 * document: a limit is never met by cutting the logo short.
 */
export interface SvgLogoLimits {
  /** The input, counted in UTF-8 bytes. */
  readonly inputBytes: number;
  /** Start tags in the input, kept or dropped. */
  readonly elements: number;
  /** Elements open at once, the root included. */
  readonly depth: number;
  /** Attributes on one element in the input, namespace declarations included. */
  readonly attributesPerElement: number;
  /** One attribute value as written, other than path data and points. */
  readonly attributeValueLength: number;
  /** One `d` or `points` value as written. */
  readonly pathDataLength: number;
  /** One run of character data, and the whole text of a `title` or `desc`. */
  readonly textLength: number;
  /** An element or attribute name, its prefix included. */
  readonly nameLength: number;
  /** One number as written, sign and exponent included. */
  readonly numberLength: number;
  /** Digits before the point once a number is normalised: 6 keeps every number below 1,000,000. */
  readonly integerDigits: number;
  /** Digits kept after the point; the rest is rounded half away from zero. */
  readonly fractionDigits: number;
  /** Stops in one gradient. */
  readonly gradientStops: number;
  /** References followed in a row: `use`, gradient `href`, `clip-path` and `mask`. */
  readonly referenceDepth: number;
  /** Elements drawn once every reference is expanded, so `use` cannot multiply the work. */
  readonly renderedElements: number;
  /**
   * What drawing the logo costs once every reference is expanded, in units of about one stroked
   * line segment (see `SVG_DRAWING_WEIGHTS`), so a logo cannot hang the page that shows it.
   */
  readonly drawingCost: number;
  /**
   * What painting the logo costs once every reference is expanded, in units of the square on the
   * larger side of its view box painted once in a solid colour (see `SVG_OVERDRAW_WEIGHTS`), so a
   * logo cannot hang the page that shows it however large it is shown. Apart from `drawingCost`,
   * which bounds the geometry whatever the size.
   */
  readonly overdraw: number;
  /** Masks and clip paths applied once every reference is expanded. */
  readonly maskApplications: number;
  /** Masks and clip paths applied inside one another, in a row. */
  readonly maskDepth: number;
  /** Elements with an id the sanitiser keeps. */
  readonly ids: number;
}

export const SVG_LOGO_LIMITS: SvgLogoLimits = Object.freeze({
  inputBytes: 512 * 1024,
  elements: 4096,
  depth: 32,
  attributesPerElement: 64,
  attributeValueLength: 4096,
  pathDataLength: 128 * 1024,
  textLength: 2048,
  nameLength: 64,
  numberLength: 32,
  integerDigits: 6,
  fractionDigits: 6,
  gradientStops: 64,
  referenceDepth: 8,
  renderedElements: 20_000,
  drawingCost: 200_000,
  overdraw: 600,
  maskApplications: 128,
  maskDepth: 4,
  ids: 1024,
});
