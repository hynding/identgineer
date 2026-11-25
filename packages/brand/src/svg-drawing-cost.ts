import type { CleanElement } from "./filter-svg-tree.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import { type SvgLengthUnit, writtenText } from "./svg-values.ts";

/**
 * What drawing each part of a logo's geometry costs, in units of about one stroked straight
 * segment, measured in Chromium at 600 CSS pixels (see the README). A curve is flattened and
 * stroked as many lines, an arc as several curves; each shape also costs a fixed amount to set up
 * (what it paints is the overdraw's to count, see `SVG_OVERDRAW_WEIGHTS`); group opacity draws
 * into a layer; a mask or clip path draws its content into a layer each time it is applied; each
 * dash is a segment of its own. A large image is rasterised in tiles, and Chromium works out every
 * dash of a stroke again for each tile its box touches, except along one horizontal or vertical
 * line and round a rectangle, whose dashes it culls to the tile: elsewhere each instance of a
 * stroked shape is charged `tiledDash` a dash, by its caps, again for the share of the tiles of an
 * image 2000 CSS pixels square at twice the density its box can touch (counted in the overdraw's
 * walk, which knows each instance's transform and paint); round caps on a stroke wider, as drawn,
 * than an eighth of the view box's larger side (wider than about 512 device pixels in that image)
 * cost Chromium about twice as much again, so are charged `wideRound`.
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
  tiledDash: Object.freeze({ butt: 4, square: 5, round: 9, wideRound: 24 }),
});

/** The refusal of a logo over `limits.drawingCost`. */
export function drawingTooCostly(limits: SvgLogoLimits): SvgLogoRejection {
  return new SvgLogoRejection(
    "drawing-too-costly",
    `would cost more than ${String(limits.drawingCost)} to draw (see SVG_DRAWING_WEIGHTS)`,
  );
}

export interface Geometry {
  /** What drawing the outline costs, before dashes. */
  readonly weight: number;
  /** An upper bound of the outline's length in its own user units, which is what dashes follow. */
  readonly length: number;
  /** Segments drawn: each a join or a cap to stroke. */
  readonly segments: number;
  /** Subpaths: each has its own two caps, and starts its dashes afresh. */
  readonly subpaths: number;
  /**
   * Whether the outline is one horizontal or vertical line of some length however Chromium reads
   * its numbers, or a rectangle without rounded corners, whose dashes Chromium culls to each tile of
   * a large image; any other outline's dashes, a path of two such lines included, are worked out
   * again for every tile its box touches.
   */
  readonly straightRun: boolean;
  /**
   * The most of the outline a square image can show, in sides of the square: a straight segment
   * at most its diagonal; a convex curve (a quadratic, an arc, a whole rectangle or ellipse) at most
   * its perimeter; a cubic, which bends at most twice, three convex pieces.
   */
  readonly visibleOutline: number;
  /**
   * An upper bound of the length of the outline's curves (quadratics, cubics, arcs, ellipses), all
   * of it, however little of it an image can show: Chromium strokes a curve whole.
   */
  readonly curvedLength: number;
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

// Chromium reads every number in single precision, by a reader of its own that adds up the digits
// in single precision too, so a number of up to 25 characters can come out about 50 single-precision
// steps (of 2^-24) from its value, and two spellings of one number apart; each sum, product and
// turn it then works out adds a step more. The bounds below hold over every such reading.
/** How far, relative to its value, Chromium's reading of a written number can be from it. */
const READ = 2 ** -17;
/** How far, relative to its value, one single-precision operation can move a result. */
const STEP = 2 ** -23;
/** The smallest normal single-precision number: a radius squared below it is read as no radius. */
const SMALLEST_NORMAL = 2 ** -126;
/** The smallest single-precision step of all, a whole step off any reading far below it. */
const SMALLEST_STEP = 2 ** -149;
/** The largest single-precision number: no radius Chromium works out can be larger. */
const LARGEST_SINGLE = 3.4028234663852886e38;
/** How much longer than its ellipse Chromium's curves drawing an arc can be. */
const ARC_CURVES = 1.001;
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
  /** How far, on either axis, Chromium's current point can be from `x` and `y`. */
  error = 0;
  startError = 0;
  controlError = 0;
  weight = 0;
  length = 0;
  segments = 0;
  subpaths = 0;
  visibleOutline = 0;
  curvedLength = 0;
  /** Whether the subpath was just closed: drawing on without a move starts another. */
  closed = false;
  /** The letter, in upper case, of the segment just drawn. */
  previous = "";
  /** Whether every segment so far is a horizontal or vertical line of some length. */
  axisLines = true;
  box: SvgBox = EMPTY_BOX;
  area = 0;
  private subpathBox: SvgBox = EMPTY_BOX;
  private fan = 0;
  private hulls = 0;

  /** Starts a subpath at the current point. */
  begin(): void {
    this.end();
    this.subpaths += 1;
    this.closed = false;
    this.startX = this.x;
    this.startY = this.y;
    this.startError = this.error;
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
    if (this.closed) {
      this.subpaths += 1;
      this.closed = false;
    }
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

  /** Counts the segment just drawn, at most `length` long, as a curve. */
  curve(length: number): void {
    this.curvedLength += length;
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
      subpaths: this.subpaths,
      straightRun: this.axisLines && this.subpaths === 1 && this.segments === 1,
      visibleOutline: this.visibleOutline,
      curvedLength: this.curvedLength,
      box: this.box,
      area: Math.min(this.area, boxArea(this.box)),
    };
  }

  /**
   * The first control point of a smooth curve: the last one reflected, or the current point; and
   * how far Chromium's reading of it can be from it, taken from where it reads the current point.
   */
  reflected(after: string): [number, number, number] {
    if (this.previous !== after && this.previous !== (after === "C" ? "S" : "T")) {
      return [this.x, this.y, 0];
    }
    const [x, y] = [2 * this.x - this.controlX, 2 * this.y - this.controlY];
    return [x, y, this.error + this.controlError + STEP * Math.max(Math.abs(x), Math.abs(y))];
  }
}

/** How far Chromium's reading of a number written `value` can be from it. */
function readingError(value: number): number {
  return READ * Math.abs(value);
}

/**
 * How much longer Chromium can find straight runs than they are, where it reads their points up to
 * `errors` away on either axis: each point's error counted once for every run it ends.
 */
function lengthSlack(...errors: readonly number[]): number {
  return Math.SQRT2 * errors.reduce((total, error) => total + error, 0);
}

/**
 * How far Chromium's reading of a point of a segment can be from it on either axis: `local`, taken
 * from where Chromium reads the current point (so the segment's own lengths and chord carry only
 * that), and `absolute`, which the next segment starts from.
 */
interface PointError {
  readonly local: number;
  readonly absolute: number;
}

/**
 * The error of a point at `offset` (a relative one, from the current point read `current` away) or
 * at `offset` itself (an absolute one), each coordinate on an axis `moved` (H and V keep the other).
 * A relative point is the current point plus the offset as read, rounded once, unless the offset is
 * nothing, which adds nothing.
 */
function pointError(
  offset: readonly [number, number],
  point: readonly [number, number],
  relative: boolean,
  current: number,
  moved: readonly [boolean, boolean] = [true, true],
): PointError {
  const along = (index: 0 | 1): number => (moved[index] ? Math.abs(offset[index]) : 0);
  const read = READ * Math.max(along(0), along(1));
  if (relative) {
    const rounded = along(0) + along(1) === 0 ? 0 : STEP * Math.max(...point.map(Math.abs));
    return { local: read + rounded, absolute: current + read + rounded };
  }
  return { local: current + read, absolute: moved[0] && moved[1] ? read : Math.max(read, current) };
}

/**
 * An upper bound of the larger radius of an arc's ellipse as Chromium draws it, its radii scaled up
 * as SVG scales radii too small to reach the end point (SVG 1.1, F.6.6), over every reading Chromium
 * can make of its numbers; 0 for a zero radius, which draws a straight line. `chordError` bounds
 * how far, on either axis, Chromium's chord from the current point to the end can be from the
 * chord as written. Along a radius far smaller than that, the radii are scaled up by as much as the
 * error over the radius, so each half chord in the arc's own frame is taken that much longer, and
 * each radius squared at its shortest reading; a radius whose square single precision cannot hold
 * as a normal number bounds nothing, and the radius is taken as the largest Chromium can work out.
 */
function arcRadius(
  pen: Pen,
  values: readonly number[],
  x: number,
  y: number,
  chordError: number,
): number {
  const rx = Math.abs(values[0] ?? 0);
  const ry = Math.abs(values[1] ?? 0);
  if (rx === 0 || ry === 0) return 0;
  const degrees = values[2] ?? 0;
  const angle = (degrees * Math.PI) / 180;
  const dx = (pen.x - x) / 2;
  const dy = (pen.y - y) / 2;
  const half = Math.hypot(dx, dy);
  const x1 = Math.cos(angle) * dx + Math.sin(angle) * dy;
  const y1 = -Math.sin(angle) * dx + Math.cos(angle) * dy;
  // The angle as read turns the half chord by at most its error in radians, and never moves a
  // point further than across the circle it turns on.
  const turn = Math.min(2, READ * Math.abs(angle) + STEP);
  const moved = (Math.SQRT2 * chordError) / 2 + STEP * half;
  const hair = moved + turn * half + STEP * (half + moved);
  const shortestSquare = (radius: number): number => {
    const square = (radius * (1 - READ)) ** 2 * (1 - STEP);
    return square < SMALLEST_NORMAL ? 0 : square;
  };
  const [squareX, squareY] = [shortestSquare(rx), shortestSquare(ry)];
  const lambda =
    squareX === 0 || squareY === 0
      ? Infinity
      : ((Math.abs(x1) + hair) ** 2 / squareX + (Math.abs(y1) + hair) ** 2 / squareY) *
        (1 + 4 * STEP);
  return Math.min(LARGEST_SINGLE, Math.max(rx, ry) * (1 + READ) * Math.sqrt(Math.max(1, lambda)));
}

/** How many times a curve is halved before its pieces' control polygons bound its length. */
const HALVINGS = 3;

/**
 * An upper bound of the length of the Bézier curve through `points` (x, y pairs: its start, its
 * control points, its end), tighter than its control polygon: the control polygons of its pieces,
 * each piece no longer than its own, summed over the curve halved `HALVINGS` times, and a step
 * more for the rounding of this sum. Chromium's reading of the points adds to it as it adds to the
 * control polygon (as a Bézier curve's derivative moves by no more than its control points do).
 */
function bezierLength(points: readonly number[], halvings = HALVINGS): number {
  if (halvings === 0) {
    let length = 0;
    for (let index = 2; index + 1 < points.length; index += 2) {
      length += Math.hypot(
        (points[index] ?? 0) - (points[index - 2] ?? 0),
        (points[index + 1] ?? 0) - (points[index - 1] ?? 0),
      );
    }
    return length * (1 + STEP);
  }
  // De Casteljau at the middle: the first piece's points are the first of each row, the second's
  // the last of each row, read backwards.
  const first: number[] = [];
  const second: number[] = [];
  let row = [...points];
  while (row.length > 0) {
    first.push(row[0] ?? 0, row[1] ?? 0);
    second.unshift(row[row.length - 2] ?? 0, row[row.length - 1] ?? 0);
    const next: number[] = [];
    for (let index = 2; index + 1 < row.length; index += 2) {
      next.push(
        ((row[index - 2] ?? 0) + (row[index] ?? 0)) / 2,
        ((row[index - 1] ?? 0) + (row[index + 1] ?? 0)) / 2,
      );
    }
    row = next;
  }
  return bezierLength(first, halvings - 1) + bezierLength(second, halvings - 1);
}

/**
 * Below this many times its larger radius, or its ends' coordinates, a small arc's chord may be too
 * short for Chromium to tell which way round its ellipse the arc turns. Chromium maps the arc onto a
 * unit circle and works out the angle it turns through in single precision; ends a few
 * single-precision steps apart there can come out turning the other way, which Chromium takes as a
 * whole turn less a hair, and so strokes the whole ellipse. That was seen only for chords up to
 * 2^-7.5 of this threshold (the worst, `M-999999 3a1000 10 89.999 0 0 0.084294 0`), over radii,
 * radius ratios, turned ellipses, chord directions, both sweeps, and starts from 0.5 to 900,000. The
 * threshold is therefore about 2^7.5 (about 180) times the longest chord seen to flip. Single
 * precision holds a point far from the origin less finely, so the coordinates bound the chord too.
 */
const SMALL_ARC_CHORD = 2 ** -16;

/**
 * An upper bound of the length of an arc drawn with the small-arc flag, `chord` (as Chromium may
 * read it) apart at its ends and at least `shortest` apart, the largest of its ends' coordinates
 * `reach`; Infinity for a large arc, or for a chord too short for Chromium to be sure of drawing the
 * small arc (see `SMALL_ARC_CHORD`). SVG picks the
 * centre so that a small arc turns at most half a turn round its ellipse (exactly half when its
 * radii are scaled up to reach), and such an arc of a circle is at most a quarter turn's ratio, pi
 * over two, longer than its chord. The ellipse is the circle stretched by its radii, which makes the
 * arc at most the larger radius times as long and the chord at least the smaller radius times: so
 * the arc is at most pi over two times the ratio of its radii (as Chromium may read them) times the
 * chord, and a thousandth more for the curves Chromium draws it with. A flat arc of a huge radius,
 * as editors write a nearly straight segment, is about as long as its chord.
 */
function smallArcLength(
  values: readonly number[],
  chord: number,
  shortest: number,
  reach: number,
): number {
  const [rx, ry] = [Math.abs(values[0] ?? 0), Math.abs(values[1] ?? 0)];
  if ((values[3] ?? 0) !== 0 || shortest < SMALL_ARC_CHORD * Math.max(rx, ry, reach)) {
    return Infinity;
  }
  const ratio = (Math.max(rx, ry) / Math.min(rx, ry)) * (1 + 4 * READ);
  return (Math.PI / 2) * ratio * chord * ARC_CURVES;
}

function drawSegment(pen: Pen, command: string, values: readonly number[], first: boolean): void {
  const upper = command.toUpperCase();
  const relative = command !== upper;
  const at = (index: number, origin: number): number =>
    (values[index] ?? 0) + (relative ? origin : 0);
  const { x, y, error } = pen;
  const errorAt = (index: number): PointError =>
    pointError(
      [values[index] ?? 0, values[index + 1] ?? 0],
      [at(index, x), at(index + 1, y)],
      relative,
      error,
    );
  const weights = SVG_DRAWING_WEIGHTS;
  if (upper === "M" && first) {
    pen.error = errorAt(0).absolute;
    pen.x = at(0, x);
    pen.y = at(1, y);
    pen.begin();
  } else if (upper === "M" || upper === "L" || upper === "H" || upper === "V") {
    const [endX, endY] =
      upper === "H" ? [at(0, x), y] : upper === "V" ? [x, at(0, y)] : [at(0, x), at(1, y)];
    const end =
      upper === "M" || upper === "L"
        ? errorAt(0)
        : pointError(
            [endX - (relative ? x : 0), endY - (relative ? y : 0)],
            [endX, endY],
            relative,
            error,
            [upper === "H", upper === "V"],
          );
    const exact = Math.hypot(endX - x, endY - y);
    const slack = lengthSlack(end.local);
    if ((upper !== "H" && upper !== "V") || exact <= slack) pen.axisLines = false;
    pen.to([endX, endY], weights.line, exact + slack, STRAIGHT);
    pen.error = end.absolute;
  } else if (upper === "Z") {
    pen.to(
      [pen.startX, pen.startY],
      weights.line,
      Math.hypot(pen.startX - x, pen.startY - y) + lengthSlack(error, pen.startError),
      STRAIGHT,
    );
    pen.error = pen.startError;
    pen.closed = true;
  } else if (upper === "C" || upper === "S") {
    const [x1, y1, reflectedError] =
      upper === "C" ? [at(0, x), at(1, y), errorAt(0).local] : pen.reflected("C");
    const offset = upper === "C" ? 2 : 0;
    const [x2, y2, endX, endY] = [
      at(offset, x),
      at(offset + 1, y),
      at(offset + 2, x),
      at(offset + 3, y),
    ];
    const [second, end] = [errorAt(offset), errorAt(offset + 2)];
    // A Bézier curve is never longer than the lines through its control points, and stays inside
    // their hull, which the four triangles on them cover.
    const length =
      Math.hypot(x1 - x, y1 - y) +
      Math.hypot(x2 - x1, y2 - y1) +
      Math.hypot(endX - x2, endY - y2) +
      lengthSlack(reflectedError, reflectedError, second.local, second.local, end.local);
    const hull =
      triangleArea(x, y, x1, y1, x2, y2) +
      triangleArea(x, y, x2, y2, endX, endY) +
      triangleArea(x, y, x1, y1, endX, endY) +
      triangleArea(x1, y1, x2, y2, endX, endY);
    pen.to([x1, y1, x2, y2, endX, endY], weights.cubic, length, 3 * CONVEX, hull);
    pen.curve(
      bezierLength([x, y, x1, y1, x2, y2, endX, endY]) +
        lengthSlack(reflectedError, reflectedError, second.local, second.local, end.local),
    );
    pen.controlX = x2;
    pen.controlY = y2;
    pen.controlError = second.absolute;
    pen.error = end.absolute;
  } else if (upper === "Q" || upper === "T") {
    const [x1, y1, reflectedError] =
      upper === "Q" ? [at(0, x), at(1, y), errorAt(0).local] : pen.reflected("Q");
    const offset = upper === "Q" ? 2 : 0;
    const [endX, endY] = [at(offset, x), at(offset + 1, y)];
    const end = errorAt(offset);
    const length =
      Math.hypot(x1 - x, y1 - y) +
      Math.hypot(endX - x1, endY - y1) +
      lengthSlack(reflectedError, reflectedError, end.local);
    pen.to(
      [x1, y1, endX, endY],
      weights.quadratic,
      length,
      CONVEX,
      triangleArea(x, y, x1, y1, endX, endY),
    );
    pen.curve(
      bezierLength([x, y, x1, y1, endX, endY]) +
        lengthSlack(reflectedError, reflectedError, end.local),
    );
    pen.controlX = x1;
    pen.controlY = y1;
    pen.controlError = upper === "Q" ? errorAt(0).absolute : error + reflectedError;
    pen.error = end.absolute;
  } else {
    // An arc is no longer than its whole ellipse and bulges no further from its chord than the
    // ellipse's area; the ellipse lies within a diameter of the current point.
    const [endX, endY] = [at(5, x), at(6, y)];
    const end = errorAt(5);
    const radius = arcRadius(pen, values, endX, endY, end.local);
    if (radius === 0) {
      pen.to(
        [endX, endY],
        weights.arc,
        Math.hypot(endX - x, endY - y) + lengthSlack(end.local),
        STRAIGHT,
      );
    } else {
      const length = 2 * Math.PI * radius * ARC_CURVES + lengthSlack(end.local);
      pen.to(
        [endX, endY],
        weights.arc,
        length,
        CONVEX,
        Math.PI * radius * radius,
        2 * radius + error,
      );
      const chord = Math.hypot(endX - x, endY - y);
      const slack = lengthSlack(end.local);
      const reach = Math.max(...[x, y, endX, endY].map(Math.abs));
      pen.curve(Math.min(length, smallArcLength(values, chord + slack, chord - slack, reach)));
    }
    pen.error = end.absolute;
  }
  if (upper !== "M" && upper !== "L" && upper !== "H" && upper !== "V") pen.axisLines = false;
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
 * when there is an odd number of them, each at the shortest Chromium can read it (a step of the
 * smallest single-precision number short, for a length far below the normal range), so no reading
 * fits more dashes in. Zero for `none` or an all-zero array, which draw solid.
 */
export function dashPeriod(value: string): number {
  if (value === "none") return 0;
  const lengths = value.split(" ").map((part) => {
    const { amount, unit } = readKeptLength(part, "dash length");
    if (unit === "%") throw new Error(`a kept dash length "${part}" is a percentage`);
    return amount * unitSize(unit, 0);
  });
  if (lengths.every((length) => length === 0)) return 0;
  const shortest = lengths.reduce(
    (total, length) => total + Math.max(0, length * (1 - READ) - SMALLEST_STEP),
    0,
  );
  return Math.max(SMALLEST_STEP, lengths.length % 2 === 1 ? 2 * shortest : shortest);
}

/** Dashes in one repeat of a kept dash array, a dash of no length included (it has its caps). */
export function dashesPerPeriod(value: string): number {
  if (value === "none") return 0;
  const count = value.split(" ").length;
  return count % 2 === 1 ? count : count / 2;
}

/** How a stroke is dashed: the length of one repeat (0 for solid) and the dashes in it. */
export interface Dashing {
  readonly period: number;
  readonly perPeriod: number;
}

/** The dashing of a kept dash array. */
export function dashingOf(value: string): Dashing {
  return { period: dashPeriod(value), perPeriod: dashesPerPeriod(value) };
}

/**
 * The most dashes a shape's stroke can be drawn in: every dash of every repeat along its length,
 * and a repeat more for each subpath, which starts the pattern afresh. None when solid. The drawing
 * cost and the overdraw both count dashes with this, so the two cannot disagree.
 */
export function dashCount(
  geometry: Pick<Geometry, "length" | "subpaths">,
  dashing: Dashing,
): number {
  if (dashing.period === 0) return 0;
  return (Math.ceil(geometry.length / dashing.period) + geometry.subpaths) * dashing.perPeriod;
}

function polyline(text: string, closed: boolean): Geometry {
  const pen = new Pen();
  const pairs = text.split(" ");
  for (const [index, pair] of pairs.entries()) {
    const [x = 0, y = 0] = pair.split(",").map(Number);
    const error = readingError(Math.max(Math.abs(x), Math.abs(y)));
    if (index === 0) {
      pen.x = x;
      pen.y = y;
      pen.error = error;
      pen.begin();
    } else {
      const slack = lengthSlack(pen.error, error);
      pen.axisLines = false;
      pen.to([x, y], SVG_DRAWING_WEIGHTS.line, Math.hypot(x - pen.x, y - pen.y) + slack, STRAIGHT);
      pen.error = error;
    }
  }
  if (closed) {
    pen.to(
      [pen.startX, pen.startY],
      SVG_DRAWING_WEIGHTS.line,
      Math.hypot(pen.startX - pen.x, pen.startY - pen.y) + lengthSlack(pen.error, pen.startError),
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
  const spelling = (name: string): string => {
    const value = element.attributes.get(name);
    return value !== undefined && "text" in value ? writtenText(value) : "0";
  };
  const same = (first: string, second: string): boolean => spelling(first) === spelling(second);
  const { line, cubic } = SVG_DRAWING_WEIGHTS;
  switch (element.name) {
    case "path":
      return measurePathData(text("d") ?? "");
    case "rect": {
      const rounded = length("rx") > 0 || length("ry") > 0;
      const [width, height] = [length("width"), length("height")];
      const outline = 2 * (width + height) * (1 + READ);
      return {
        weight: 4 * line + (rounded ? 4 * cubic : 0),
        length: outline,
        segments: rounded ? 8 : 4,
        subpaths: 1,
        straightRun: !rounded && width > 0 && height > 0,
        visibleOutline: CONVEX,
        // The corners together make an ellipse no larger than one of the larger radius.
        curvedLength: rounded
          ? Math.min(outline, 2 * Math.PI * Math.max(length("rx"), length("ry")) * (1 + READ))
          : 0,
        box: boxOf(length("x"), length("y"), width, height),
        area: width * height,
      };
    }
    case "circle":
    case "ellipse": {
      const [rx, ry] =
        element.name === "circle" ? [length("r"), length("r")] : [length("rx"), length("ry")];
      const outline = Math.PI * Math.sqrt(2 * (rx * rx + ry * ry)) * (1 + READ);
      return {
        weight: 4 * cubic,
        length: outline,
        segments: 4,
        subpaths: 1,
        straightRun: false,
        visibleOutline: CONVEX,
        curvedLength: outline,
        box: boxOf(length("cx") - rx, length("cy") - ry, 2 * rx, 2 * ry),
        area: Math.PI * rx * ry,
      };
    }
    case "line": {
      const [x1, y1, x2, y2] = [length("x1"), length("y1"), length("x2"), length("y2")];
      const exact = Math.hypot(x2 - x1, y2 - y1);
      const slack = lengthSlack(
        readingError(Math.max(Math.abs(x1), Math.abs(y1))),
        readingError(Math.max(Math.abs(x2), Math.abs(y2))),
      );
      return {
        weight: line,
        length: exact + slack,
        segments: 1,
        subpaths: 1,
        // Ends that share a coordinate written the same are read the same, so the line is exactly
        // horizontal or vertical; written two ways, they may be read a hair apart.
        straightRun: (same("x1", "x2") || same("y1", "y2")) && exact > slack,
        visibleOutline: STRAIGHT,
        curvedLength: 0,
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
