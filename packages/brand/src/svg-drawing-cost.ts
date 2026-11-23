import type { CleanElement } from "./filter-svg-tree.ts";
import type { SvgLengthUnit } from "./svg-values.ts";

/**
 * What drawing each part of a logo costs, in units of about one stroked straight segment, measured
 * in Chromium at 600 CSS pixels (see the README). A curve is flattened and stroked as many lines,
 * an arc as several curves; each shape also costs a fixed amount to set up and fill, enough to
 * cover a full-size gradient fill; group opacity draws into a layer; a mask or clip path draws its
 * content into a layer each time it is applied; each dash is a segment of its own.
 */
export const SVG_DRAWING_WEIGHTS = Object.freeze({
  line: 1,
  quadratic: 6,
  cubic: 10,
  arc: 14,
  shape: 32,
  element: 1,
  layer: 50,
  mask: 200,
  dash: 1,
});

export interface Geometry {
  /** What drawing the outline costs, before dashes. */
  readonly weight: number;
  /** An upper bound of the outline's length in its own user units, which is what dashes follow. */
  readonly length: number;
}

const ARITY: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};
const SEGMENT = /([A-Za-z])([^A-Za-z]*)/g;

/** The current point and what the next smooth curve reflects. */
class Pen {
  x = 0;
  y = 0;
  startX = 0;
  startY = 0;
  controlX = 0;
  controlY = 0;
  weight = 0;
  length = 0;
  /** The letter, in upper case, of the segment just drawn. */
  previous = "";

  to(x: number, y: number, weight: number, length: number): void {
    this.weight += weight;
    this.length += length;
    this.x = x;
    this.y = y;
  }

  /** The first control point of a smooth curve: the last one reflected, or the current point. */
  reflected(after: string): [number, number] {
    return this.previous === after || this.previous === (after === "C" ? "S" : "T")
      ? [2 * this.x - this.controlX, 2 * this.y - this.controlY]
      : [this.x, this.y];
  }
}

/**
 * The longest an arc can be: its whole ellipse, with the radii scaled up as SVG scales radii too
 * small to reach the end point (SVG 1.1, F.6.6). A zero radius draws a straight line.
 */
function arcLength(pen: Pen, values: readonly number[], x: number, y: number): number {
  let rx = Math.abs(values[0] ?? 0);
  let ry = Math.abs(values[1] ?? 0);
  if (rx === 0 || ry === 0) return Math.hypot(x - pen.x, y - pen.y);
  const angle = ((values[2] ?? 0) * Math.PI) / 180;
  const dx = (pen.x - x) / 2;
  const dy = (pen.y - y) / 2;
  const x1 = Math.cos(angle) * dx + Math.sin(angle) * dy;
  const y1 = -Math.sin(angle) * dx + Math.cos(angle) * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  return 2 * Math.PI * Math.max(rx, ry);
}

function drawSegment(pen: Pen, command: string, values: readonly number[], first: boolean): void {
  const upper = command.toUpperCase();
  const relative = command !== upper;
  const at = (index: number, origin: number): number =>
    (values[index] ?? 0) + (relative ? origin : 0);
  const { x, y } = pen;
  const weights = SVG_DRAWING_WEIGHTS;
  if (upper === "M" && first) {
    pen.to(at(0, x), at(1, y), 0, 0);
    pen.startX = pen.x;
    pen.startY = pen.y;
  } else if (upper === "M" || upper === "L") {
    pen.to(at(0, x), at(1, y), weights.line, Math.hypot(at(0, x) - x, at(1, y) - y));
  } else if (upper === "H") {
    pen.to(at(0, x), y, weights.line, Math.abs(at(0, x) - x));
  } else if (upper === "V") {
    pen.to(x, at(0, y), weights.line, Math.abs(at(0, y) - y));
  } else if (upper === "Z") {
    pen.to(pen.startX, pen.startY, weights.line, Math.hypot(pen.startX - x, pen.startY - y));
  } else if (upper === "C" || upper === "S") {
    const [x1, y1] = upper === "C" ? [at(0, x), at(1, y)] : pen.reflected("C");
    const offset = upper === "C" ? 2 : 0;
    const [x2, y2, endX, endY] = [
      at(offset, x),
      at(offset + 1, y),
      at(offset + 2, x),
      at(offset + 3, y),
    ];
    // A Bézier curve is never longer than the lines through its control points.
    const length =
      Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(endX - x2, endY - y2);
    pen.to(endX, endY, weights.cubic, length);
    pen.controlX = x2;
    pen.controlY = y2;
  } else if (upper === "Q" || upper === "T") {
    const [x1, y1] = upper === "Q" ? [at(0, x), at(1, y)] : pen.reflected("Q");
    const offset = upper === "Q" ? 2 : 0;
    const [endX, endY] = [at(offset, x), at(offset + 1, y)];
    pen.to(
      endX,
      endY,
      weights.quadratic,
      Math.hypot(x1 - x, y1 - y) + Math.hypot(endX - x1, endY - y1),
    );
    pen.controlX = x1;
    pen.controlY = y1;
  } else {
    const [endX, endY] = [at(5, x), at(6, y)];
    pen.to(endX, endY, weights.arc, arcLength(pen, values, endX, endY));
  }
  pen.previous = upper;
}

/** Weighs path data as the sanitiser writes it, and bounds its length. */
export function measurePathData(data: string): Geometry {
  const pen = new Pen();
  for (const [, command = "", text = ""] of data.matchAll(SEGMENT)) {
    const numbers = text === "" ? [] : text.split(" ").map(Number);
    const arity = ARITY[command.toUpperCase()] ?? 0;
    if (arity === 0) {
      drawSegment(pen, command, numbers, false);
      continue;
    }
    for (let index = 0; index < numbers.length; index += arity) {
      drawSegment(pen, command, numbers.slice(index, index + arity), index === 0);
    }
  }
  return { weight: pen.weight, length: pen.length };
}

const KEPT_LENGTH = /^(-?[0-9.]+)([a-z%]*)$/;
const KEPT_UNITS: ReadonlySet<string> = new Set<SvgLengthUnit>([
  "",
  "%",
  "mm",
  "cm",
  "in",
  "pt",
  "pc",
]);

function isKeptUnit(unit: string): unit is SvgLengthUnit {
  return KEPT_UNITS.has(unit);
}

/** User units in one of `unit`, a percentage taken of `percentBase`; a pixel is written bare. */
function unitSize(unit: SvgLengthUnit, percentBase: number): number {
  switch (unit) {
    case "":
      return 1;
    case "%":
      return percentBase / 100;
    case "mm":
      return 96 / 25.4;
    case "cm":
      return 96 / 2.54;
    case "in":
      return 96;
    case "pt":
      return 4 / 3;
    case "pc":
      return 16;
  }
}

/**
 * A kept length read back. Anything a grammar would not have kept is a defect upstream, and is
 * refused rather than read as zero: a length that cost nothing would let its drawing cost nothing.
 */
function readKeptLength(text: string, what: string): { amount: number; unit: SvgLengthUnit } {
  const match = KEPT_LENGTH.exec(text);
  const unit = match?.[2] ?? "";
  if (match === null || !isKeptUnit(unit)) {
    throw new Error(`a kept ${what} "${text}" is not in a form any grammar keeps`);
  }
  return { amount: Number(match[1]), unit };
}

/** A kept length in user units, a percentage taken of `percentBase`; 0 when there is none. */
function userUnits(text: string | undefined, percentBase: number): number {
  if (text === undefined) return 0;
  const { amount, unit } = readKeptLength(text, "length");
  return amount * unitSize(unit, percentBase);
}

/**
 * The length of one repeat of a kept dash array in user units: its lengths added up, twice over
 * when there is an odd number of them. Zero for `none` or an all-zero array, which draw solid.
 */
export function dashPeriod(value: string): number {
  if (value === "none") return 0;
  const lengths = value.split(" ").map((part) => {
    const { amount, unit } = readKeptLength(part, "dash length");
    if (unit === "%") throw new Error(`a kept dash length "${part}" is a percentage`);
    return amount * unitSize(unit, 0);
  });
  const sum = lengths.reduce((total, length) => total + length, 0);
  return lengths.length % 2 === 1 ? 2 * sum : sum;
}

function pointsOf(text: string): [number, number][] {
  return text.split(" ").map((pair) => {
    const [x = 0, y = 0] = pair.split(",").map(Number);
    return [x, y];
  });
}

function polyline(text: string, closed: boolean): Geometry {
  const points = pointsOf(text);
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [x0 = 0, y0 = 0] = points[index - 1] ?? [];
    const [x1 = 0, y1 = 0] = points[index] ?? [];
    length += Math.hypot(x1 - x0, y1 - y0);
  }
  const [firstX = 0, firstY = 0] = points[0] ?? [];
  const [lastX = 0, lastY = 0] = points.at(-1) ?? [];
  const segments = points.length - 1 + (closed ? 1 : 0);
  return {
    weight: segments * SVG_DRAWING_WEIGHTS.line,
    length: length + (closed ? Math.hypot(firstX - lastX, firstY - lastY) : 0),
  };
}

/**
 * The geometry of a shape, `undefined` for anything else. Percentages are taken of `percentBase`,
 * the larger side of the view box, which bounds what they can resolve to from above.
 */
export function measureShape(element: CleanElement, percentBase: number): Geometry | undefined {
  const text = (name: string): string | undefined => {
    const value = element.attributes.get(name);
    return value !== undefined && "text" in value ? value.text : undefined;
  };
  const length = (name: string): number => userUnits(text(name), percentBase);
  const { line, cubic } = SVG_DRAWING_WEIGHTS;
  switch (element.name) {
    case "path":
      return measurePathData(text("d") ?? "");
    case "rect": {
      const rounded = length("rx") > 0 || length("ry") > 0;
      return {
        weight: 4 * line + (rounded ? 4 * cubic : 0),
        length: 2 * (length("width") + length("height")),
      };
    }
    case "circle":
      return { weight: 4 * cubic, length: 2 * Math.PI * length("r") };
    case "ellipse":
      return { weight: 4 * cubic, length: 2 * Math.PI * Math.max(length("rx"), length("ry")) };
    case "line":
      return {
        weight: line,
        length: Math.hypot(length("x2") - length("x1"), length("y2") - length("y1")),
      };
    case "polyline":
    case "polygon":
      return polyline(text("points") ?? "", element.name === "polygon");
    default:
      return undefined;
  }
}
