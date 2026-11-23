import type { CleanElement } from "./filter-svg-tree.ts";
import type { SvgLengthUnit } from "./svg-values.ts";

/**
 * What drawing each part of a logo's geometry costs, in units of about one stroked straight
 * segment, measured in Chromium at 600 CSS pixels (see the README). A curve is flattened and
 * stroked as many lines, an arc as several curves; each shape also costs a fixed amount to set up
 * (what it paints is the overdraw's to count, see `SVG_OVERDRAW_WEIGHTS`); group opacity draws
 * into a layer; a mask or clip path draws its content into a layer each time it is applied; each
 * dash is a segment of its own.
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
  /** Segments drawn: each a join or a cap to stroke. */
  readonly segments: number;
  /**
   * The most of the outline a square image can show, in sides of the square: a straight segment
   * at most its diagonal; a convex curve (a quadratic, an arc, a whole rectangle or ellipse) at most
   * its perimeter; a cubic, which bends at most twice, three convex pieces.
   */
  readonly visibleOutline: number;
  /** The box of every point, control points included; an arc's box holds its whole ellipse. */
  readonly box: SvgBox;
  /** An upper bound of the area a fill covers, in square user units, never more than the box. */
  readonly area: number;
}

/** An axis-aligned box; empty when `minX > maxX`. */
export interface SvgBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const EMPTY_BOX: SvgBox = Object.freeze({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
});

export function boxArea(box: SvgBox): number {
  return box.minX > box.maxX ? 0 : (box.maxX - box.minX) * (box.maxY - box.minY);
}

function triangleArea(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
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
/** In sides of a square image: its diagonal, and its perimeter (see `Geometry.visibleOutline`). */
const STRAIGHT = Math.SQRT2;
const CONVEX = 4;

/**
 * The current point and what the next smooth curve reflects, with what has been drawn so far. The
 * area a fill covers is bounded subpath by subpath: by the subpath's box, and by the triangles
 * fanned from its start over its control polygon plus the hull of each curve (a point the fill
 * covers is inside one or the other), whichever is smaller.
 */
class Pen {
  x = 0;
  y = 0;
  startX = 0;
  startY = 0;
  controlX = 0;
  controlY = 0;
  weight = 0;
  length = 0;
  segments = 0;
  visibleOutline = 0;
  /** The letter, in upper case, of the segment just drawn. */
  previous = "";
  box: SvgBox = EMPTY_BOX;
  area = 0;
  private subpathBox: SvgBox = EMPTY_BOX;
  private fan = 0;
  private hulls = 0;

  /** Starts a subpath at the current point. */
  begin(): void {
    this.end();
    this.startX = this.x;
    this.startY = this.y;
    this.include(this.x, this.y, 0);
  }

  /** Closes the bound of the subpath being drawn, if any. */
  end(): void {
    this.area += Math.min(boxArea(this.subpathBox), this.fan + this.hulls);
    this.subpathBox = EMPTY_BOX;
    this.fan = 0;
    this.hulls = 0;
  }

  /**
   * Draws a segment from the current point through `points` (its control points, then its end).
   * `visible` is the most of it a square image can show, in sides; `hull` bounds the area between
   * the segment and its control polygon; `reach` grows the box around the current point by that
   * much, for an arc, which may bulge anywhere within it.
   */
  to(
    points: readonly number[],
    weight: number,
    length: number,
    visible: number,
    hull = 0,
    reach = 0,
  ): void {
    let fromX = this.x;
    let fromY = this.y;
    this.include(fromX, fromY, reach);
    for (let index = 0; index + 1 < points.length; index += 2) {
      const toX = points[index] ?? 0;
      const toY = points[index + 1] ?? 0;
      this.fan += triangleArea(this.startX, this.startY, fromX, fromY, toX, toY);
      this.include(toX, toY, 0);
      fromX = toX;
      fromY = toY;
    }
    this.hulls += hull;
    this.weight += weight;
    this.length += length;
    this.segments += 1;
    this.visibleOutline += visible;
    this.x = fromX;
    this.y = fromY;
  }

  private include(x: number, y: number, reach: number): void {
    const grown = {
      minX: Math.min(this.subpathBox.minX, x - reach),
      minY: Math.min(this.subpathBox.minY, y - reach),
      maxX: Math.max(this.subpathBox.maxX, x + reach),
      maxY: Math.max(this.subpathBox.maxY, y + reach),
    };
    this.subpathBox = grown;
    this.box = {
      minX: Math.min(this.box.minX, grown.minX),
      minY: Math.min(this.box.minY, grown.minY),
      maxX: Math.max(this.box.maxX, grown.maxX),
      maxY: Math.max(this.box.maxY, grown.maxY),
    };
  }

  geometry(): Geometry {
    this.end();
    return {
      weight: this.weight,
      length: this.length,
      segments: this.segments,
      visibleOutline: this.visibleOutline,
      box: this.box,
      area: Math.min(this.area, boxArea(this.box)),
    };
  }

  /** The first control point of a smooth curve: the last one reflected, or the current point. */
  reflected(after: string): [number, number] {
    return this.previous === after || this.previous === (after === "C" ? "S" : "T")
      ? [2 * this.x - this.controlX, 2 * this.y - this.controlY]
      : [this.x, this.y];
  }
}

/**
 * The larger radius of an arc's ellipse, scaled up as SVG scales radii too small to reach the end
 * point (SVG 1.1, F.6.6); 0 for a zero radius, which draws a straight line.
 */
function arcRadius(pen: Pen, values: readonly number[], x: number, y: number): number {
  let rx = Math.abs(values[0] ?? 0);
  let ry = Math.abs(values[1] ?? 0);
  if (rx === 0 || ry === 0) return 0;
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
  return Math.max(rx, ry);
}

function drawSegment(pen: Pen, command: string, values: readonly number[], first: boolean): void {
  const upper = command.toUpperCase();
  const relative = command !== upper;
  const at = (index: number, origin: number): number =>
    (values[index] ?? 0) + (relative ? origin : 0);
  const { x, y } = pen;
  const weights = SVG_DRAWING_WEIGHTS;
  if (upper === "M" && first) {
    pen.x = at(0, x);
    pen.y = at(1, y);
    pen.begin();
  } else if (upper === "M" || upper === "L") {
    pen.to([at(0, x), at(1, y)], weights.line, Math.hypot(at(0, x) - x, at(1, y) - y), STRAIGHT);
  } else if (upper === "H") {
    pen.to([at(0, x), y], weights.line, Math.abs(at(0, x) - x), STRAIGHT);
  } else if (upper === "V") {
    pen.to([x, at(0, y)], weights.line, Math.abs(at(0, y) - y), STRAIGHT);
  } else if (upper === "Z") {
    pen.to(
      [pen.startX, pen.startY],
      weights.line,
      Math.hypot(pen.startX - x, pen.startY - y),
      STRAIGHT,
    );
  } else if (upper === "C" || upper === "S") {
    const [x1, y1] = upper === "C" ? [at(0, x), at(1, y)] : pen.reflected("C");
    const offset = upper === "C" ? 2 : 0;
    const [x2, y2, endX, endY] = [
      at(offset, x),
      at(offset + 1, y),
      at(offset + 2, x),
      at(offset + 3, y),
    ];
    // A Bézier curve is never longer than the lines through its control points, and stays inside
    // their hull, which the four triangles on them cover.
    const length =
      Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(endX - x2, endY - y2);
    const hull =
      triangleArea(x, y, x1, y1, x2, y2) +
      triangleArea(x, y, x2, y2, endX, endY) +
      triangleArea(x, y, x1, y1, endX, endY) +
      triangleArea(x1, y1, x2, y2, endX, endY);
    pen.to([x1, y1, x2, y2, endX, endY], weights.cubic, length, 3 * CONVEX, hull);
    pen.controlX = x2;
    pen.controlY = y2;
  } else if (upper === "Q" || upper === "T") {
    const [x1, y1] = upper === "Q" ? [at(0, x), at(1, y)] : pen.reflected("Q");
    const offset = upper === "Q" ? 2 : 0;
    const [endX, endY] = [at(offset, x), at(offset + 1, y)];
    pen.to(
      [x1, y1, endX, endY],
      weights.quadratic,
      Math.hypot(x1 - x, y1 - y) + Math.hypot(endX - x1, endY - y1),
      CONVEX,
      triangleArea(x, y, x1, y1, endX, endY),
    );
    pen.controlX = x1;
    pen.controlY = y1;
  } else {
    // An arc is no longer than its whole ellipse and bulges no further from its chord than the
    // ellipse's area; the ellipse lies within a diameter of the current point.
    const [endX, endY] = [at(5, x), at(6, y)];
    const radius = arcRadius(pen, values, endX, endY);
    if (radius === 0) {
      pen.to([endX, endY], weights.arc, Math.hypot(endX - x, endY - y), STRAIGHT);
    } else {
      pen.to(
        [endX, endY],
        weights.arc,
        2 * Math.PI * radius,
        CONVEX,
        Math.PI * radius * radius,
        2 * radius,
      );
    }
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
  return pen.geometry();
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
export function userUnits(text: string | undefined, percentBase: number): number {
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

function polyline(text: string, closed: boolean): Geometry {
  const pen = new Pen();
  const pairs = text.split(" ");
  for (const [index, pair] of pairs.entries()) {
    const [x = 0, y = 0] = pair.split(",").map(Number);
    if (index === 0) {
      pen.x = x;
      pen.y = y;
      pen.begin();
    } else {
      pen.to([x, y], SVG_DRAWING_WEIGHTS.line, Math.hypot(x - pen.x, y - pen.y), STRAIGHT);
    }
  }
  if (closed) {
    pen.to(
      [pen.startX, pen.startY],
      SVG_DRAWING_WEIGHTS.line,
      Math.hypot(pen.startX - pen.x, pen.startY - pen.y),
      STRAIGHT,
    );
  }
  return pen.geometry();
}

function boxOf(x: number, y: number, width: number, height: number): SvgBox {
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
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
      const [width, height] = [length("width"), length("height")];
      return {
        weight: 4 * line + (rounded ? 4 * cubic : 0),
        length: 2 * (width + height),
        segments: rounded ? 8 : 4,
        visibleOutline: CONVEX,
        box: boxOf(length("x"), length("y"), width, height),
        area: width * height,
      };
    }
    case "circle":
    case "ellipse": {
      const [rx, ry] =
        element.name === "circle" ? [length("r"), length("r")] : [length("rx"), length("ry")];
      return {
        weight: 4 * cubic,
        length: 2 * Math.PI * Math.max(rx, ry),
        segments: 4,
        visibleOutline: CONVEX,
        box: boxOf(length("cx") - rx, length("cy") - ry, 2 * rx, 2 * ry),
        area: Math.PI * rx * ry,
      };
    }
    case "line": {
      const [x1, y1, x2, y2] = [length("x1"), length("y1"), length("x2"), length("y2")];
      return {
        weight: line,
        length: Math.hypot(x2 - x1, y2 - y1),
        segments: 1,
        visibleOutline: STRAIGHT,
        box: {
          minX: Math.min(x1, x2),
          minY: Math.min(y1, y2),
          maxX: Math.max(x1, x2),
          maxY: Math.max(y1, y2),
        },
        area: 0,
      };
    }
    case "polyline":
    case "polygon":
      return polyline(text("points") ?? "", element.name === "polygon");
    default:
      return undefined;
  }
}
