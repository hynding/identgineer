import { isXmlWhitespace } from "./svg-characters.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { arcRoundingError, type SvgArc } from "./svg-arc-rounding.ts";
import { normaliseNumber, noteRoundingError, scanNumber } from "./svg-number.ts";

const ARITY: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  T: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  A: 7,
  Z: 0,
};

class Cursor {
  position = 0;
  /** The last number read, exactly as written. */
  exact = 0;
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  /** White space with at most one comma in it, as between two numbers. */
  skipCommaWhitespace(): void {
    this.skipWhitespace();
    if (this.text.charCodeAt(this.position) === 0x2c) this.position += 1;
    this.skipWhitespace();
  }

  skipWhitespace(): void {
    while (
      this.position < this.text.length &&
      isXmlWhitespace(this.text.charCodeAt(this.position))
    ) {
      this.position += 1;
    }
  }

  atEnd(): boolean {
    return this.position >= this.text.length;
  }

  number(limits: SvgLogoLimits): string | undefined {
    const end = scanNumber(this.text, this.position);
    if (end === -1) return undefined;
    const token = this.text.slice(this.position, end);
    this.position = end;
    this.exact = Number(token);
    return normaliseNumber(token, limits);
  }

  flag(): string | undefined {
    const unit = this.text[this.position];
    if (unit !== "0" && unit !== "1") return undefined;
    this.position += 1;
    this.exact = Number(unit);
    return unit;
  }
}

/** A number of a path, as written out and exactly as written. */
interface PathNumber {
  readonly text: string;
  readonly exact: number;
  /** The number as written out. */
  readonly written: number;
}

function readArguments(
  cursor: Cursor,
  command: string,
  limits: SvgLogoLimits,
): PathNumber[] | undefined {
  const arity = ARITY[command.toUpperCase()] ?? 0;
  const values: PathNumber[] = [];
  if (arity === 0) return values;
  for (;;) {
    for (let index = 0; index < arity; index += 1) {
      // Only white space between a command and its first number, as Chromium reads it.
      if (index === 0) cursor.skipWhitespace();
      else cursor.skipCommaWhitespace();
      // The two arc flags are single digits that may touch what follows: `a1 1 0 00 1 1`.
      const value =
        arity === 7 && (index === 3 || index === 4) ? cursor.flag() : cursor.number(limits);
      if (value === undefined) return undefined;
      values.push({ text: value, exact: cursor.exact, written: Number(value) });
    }
    cursor.skipWhitespace();
    const before = cursor.position;
    if (cursor.text.charCodeAt(cursor.position) === 0x2c) cursor.position += 1;
    cursor.skipWhitespace();
    if (scanNumber(cursor.text, cursor.position) === -1) {
      // Chromium takes a comma after the last number before the next command, and so does this.
      if (!Object.hasOwn(ARITY, (cursor.text[cursor.position] ?? "").toUpperCase())) {
        cursor.position = before;
      }
      return values;
    }
  }
}

const exactly = ({ exact }: PathNumber): number => exact;
const asWritten = ({ written }: PathNumber): number => written;

/** Where a path's pen is, from the numbers it is moved by, and where its subpath started. */
class Pen {
  x = 0;
  y = 0;
  private startX = 0;
  private startY = 0;

  /** Moves the pen past one set of a command's arguments, each read by `read`. */
  move(command: string, values: readonly PathNumber[], read: (value: PathNumber) => number): void {
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const first = values[0];
    if (upper === "Z") {
      this.x = this.startX;
      this.y = this.startY;
    } else if (upper === "H") {
      this.x = (relative ? this.x : 0) + (first === undefined ? 0 : read(first));
    } else if (upper === "V") {
      this.y = (relative ? this.y : 0) + (first === undefined ? 0 : read(first));
    } else {
      const x = values[values.length - 2];
      const y = values[values.length - 1];
      this.x = (relative ? this.x : 0) + (x === undefined ? 0 : read(x));
      this.y = (relative ? this.y : 0) + (y === undefined ? 0 : read(y));
      if (upper === "M") {
        this.startX = this.x;
        this.startY = this.y;
      }
    }
  }
}

/** An arc's numbers, as given, drawn from where the pen is. */
function arcFrom(
  pen: Pen,
  arc: readonly PathNumber[],
  read: (value: PathNumber) => number,
  relative: boolean,
): SvgArc {
  const [rx = 0, ry = 0, angle = 0, large = 0, sweep = 0, x = 0, y = 0] = arc.map(read);
  const [baseX, baseY] = relative ? [pen.x, pen.y] : [0, 0];
  return {
    x1: pen.x,
    y1: pen.y,
    rx,
    ry,
    angle,
    large: large !== 0,
    sweep: sweep !== 0,
    x2: baseX + x,
    y2: baseY + y,
  };
}

/** A radius as written and, where rounding changed it, the other six-decimal number beside it. */
function radiusChoices(radius: PathNumber, limits: SvgLogoLimits): PathNumber[] {
  const { written } = radius;
  if (written === radius.exact) return [radius];
  const step = 10 ** -limits.fractionDigits;
  const other = written + (radius.exact > written ? step : -step);
  const text = normaliseNumber(other.toFixed(limits.fractionDigits), limits);
  return text === undefined
    ? [radius]
    : [radius, { text, exact: radius.exact, written: Number(text) }];
}

/**
 * An arc's numbers as written, and how far that moves the arc it draws (see `arcRoundingError`),
 * or `undefined` where a radius that was not zero rounds to zero (a line, where Chromium draws an
 * ellipse) or no bound is known. Where the radii barely fit between the ends, rounding a radius
 * up can leave it too short, which moves the centre by the square root of the shortfall; so where
 * the nearest six decimals move the arc further than its numbers moved, a radius may be written as
 * the six-decimal number on the other side of it, whichever of them moves the arc least.
 */
function writeArc(
  pen: Pen,
  written: Pen,
  arc: readonly PathNumber[],
  relative: boolean,
  limits: SvgLogoLimits,
): { readonly arc: PathNumber[]; readonly error: number } | undefined {
  const [rx, ry] = arc;
  if (rx === undefined || ry === undefined) return undefined;
  if ([rx, ry].some(({ written, exact }) => exact !== 0 && written === 0)) return undefined;
  const exact = arcFrom(pen, arc, exactly, relative);
  const errorOf = (numbers: readonly PathNumber[]): number | undefined =>
    arcRoundingError(exact, arcFrom(written, numbers, asWritten, relative));
  const nearest = errorOf(arc);
  const moved =
    Math.hypot(pen.x - written.x, pen.y - written.y) +
    Math.max(...arc.map(({ written: number, exact: given }) => Math.abs(number - given)));
  if (nearest !== undefined && nearest <= 2 * moved) return { arc: [...arc], error: nearest };
  let best = nearest === undefined ? undefined : { arc: [...arc], error: nearest };
  for (const radiusX of radiusChoices(rx, limits)) {
    for (const radiusY of radiusChoices(ry, limits)) {
      const choice = [radiusX, radiusY, ...arc.slice(2)];
      const error = errorOf(choice);
      if (error !== undefined && (best === undefined || error < best.error)) {
        best = { arc: choice, error };
      }
    }
  }
  return best;
}

/**
 * Path data by the SVG grammar, written back canonically: each command letter as written, its
 * numbers normalised and separated by single spaces, repeated coordinate pairs kept under one
 * letter. It must start with a move; anything outside the grammar is `undefined`, and so is an arc
 * whose radius rounds to zero (see `writeArc`).
 */
export function parseSvgPathData(input: string, limits: SvgLogoLimits): string | undefined {
  const cursor = new Cursor(input);
  const pen = new Pen();
  // Where the pen is as the numbers are written out: relative commands carry each rounding on.
  const written = new Pen();
  const segments: string[] = [];
  cursor.skipWhitespace();
  while (!cursor.atEnd()) {
    const command = input[cursor.position] ?? "";
    if (!Object.hasOwn(ARITY, command.toUpperCase()) || command.length !== 1) return undefined;
    if (segments.length === 0 && command !== "M" && command !== "m") return undefined;
    cursor.position += 1;
    const values = readArguments(cursor, command, limits);
    if (values === undefined) return undefined;
    const arity = ARITY[command.toUpperCase()] ?? 0;
    if (arity === 0) {
      pen.move(command, [], exactly);
      written.move(command, [], asWritten);
    }
    for (let start = 0; start < values.length; start += arity) {
      let set = values.slice(start, start + arity);
      if (arity === 7) {
        const chosen = writeArc(pen, written, set, command === "a", limits);
        if (chosen === undefined) return undefined;
        noteRoundingError(chosen.error);
        set = chosen.arc;
        values.splice(start, arity, ...set);
      }
      // After the first pair, a move's pairs are lines.
      const step =
        start > 0 && command.toUpperCase() === "M" ? (command === "m" ? "l" : "L") : command;
      // A point drawn relative to the pen moves as far as the pen has, and by its own rounding.
      let rounding = 0;
      for (const { written: number, exact } of set) {
        rounding = Math.max(rounding, Math.abs(number - exact));
      }
      noteRoundingError(Math.hypot(pen.x - written.x, pen.y - written.y) + rounding);
      pen.move(step, set, exactly);
      written.move(step, set, asWritten);
    }
    segments.push(command + values.map(({ text }) => text).join(" "));
    cursor.skipWhitespace();
  }
  return segments.length === 0 ? undefined : segments.join("");
}

/**
 * A list of numbers, `undefined` for anything else; used for points, view boxes, dashes and the
 * arguments of a transform function, whose numbers exactly as written go into `exact` when given.
 */
export function parseSvgNumberList(
  input: string,
  limits: SvgLogoLimits,
  exact?: number[],
): string[] | undefined {
  const cursor = new Cursor(input);
  const values: string[] = [];
  cursor.skipWhitespace();
  while (!cursor.atEnd()) {
    const value = cursor.number(limits);
    if (value === undefined) return undefined;
    values.push(value);
    exact?.push(cursor.exact);
    cursor.skipWhitespace();
    if (cursor.text.charCodeAt(cursor.position) === 0x2c) {
      cursor.position += 1;
      cursor.skipWhitespace();
      if (cursor.atEnd()) return undefined;
    }
  }
  return values;
}
