import { isXmlWhitespace } from "./svg-characters.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { normaliseNumber, scanNumber } from "./svg-number.ts";

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
      values.push({ text: value, exact: cursor.exact });
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

/** Where a path's pen is, exactly as written, and where its subpath started. */
class Pen {
  x = 0;
  y = 0;
  private startX = 0;
  private startY = 0;

  /** Moves the pen past one set of a command's arguments. */
  move(command: string, values: readonly number[]): void {
    const relative = command === command.toLowerCase();
    const at = (index: number): number => values[index] ?? 0;
    const [baseX, baseY] = relative ? [this.x, this.y] : [0, 0];
    switch (command.toUpperCase()) {
      case "Z":
        [this.x, this.y] = [this.startX, this.startY];
        return;
      case "H":
        this.x = baseX + at(0);
        return;
      case "V":
        this.y = baseY + at(0);
        return;
      default: {
        const last = values.length - 2;
        [this.x, this.y] = [baseX + at(last), baseY + at(last + 1)];
        if (command.toUpperCase() === "M") [this.startX, this.startY] = [this.x, this.y];
      }
    }
  }
}

/**
 * Whether rounding an arc's radii to six decimals reshapes it beyond rounding: a radius that was
 * not zero rounded to zero, which draws a line; or, where the radii are too small for the arc and
 * Chromium scales them up to fit it (keeping their ratio, so the ratio alone sets the shape), a
 * ratio changed by more than a millionth, which the scaling magnifies up to the arc's size.
 */
function reshapesArc(pen: Pen, arc: readonly PathNumber[], relative: boolean): boolean {
  const [rx, ry, angle, , , x, y] = arc.map(({ exact }) => exact);
  const [writtenX, writtenY] = arc.map(({ text }) => Math.abs(Number(text)));
  const [radiusX, radiusY] = [Math.abs(rx ?? 0), Math.abs(ry ?? 0)];
  if (radiusX === 0 || radiusY === 0) return false;
  if (writtenX === 0 || writtenY === 0) return true;
  const [toX, toY] = relative ? [pen.x + (x ?? 0), pen.y + (y ?? 0)] : [x ?? 0, y ?? 0];
  const radians = ((angle ?? 0) * Math.PI) / 180;
  const [halfX, halfY] = [(pen.x - toX) / 2, (pen.y - toY) / 2];
  const along = Math.cos(radians) * halfX + Math.sin(radians) * halfY;
  const across = -Math.sin(radians) * halfX + Math.cos(radians) * halfY;
  const scaled = (along / radiusX) ** 2 + (across / radiusY) ** 2 > 1;
  const ratio = (writtenX ?? 0) / (writtenY ?? 1) / (radiusX / radiusY);
  return scaled && Math.abs(ratio - 1) > 1e-6;
}

/**
 * Path data by the SVG grammar, written back canonically: each command letter as written, its
 * numbers normalised and separated by single spaces, repeated coordinate pairs kept under one
 * letter. It must start with a move; anything outside the grammar is `undefined`, and so is an arc
 * that rounding reshapes (see `reshapesArc`).
 */
export function parseSvgPathData(input: string, limits: SvgLogoLimits): string | undefined {
  const cursor = new Cursor(input);
  const pen = new Pen();
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
    if (arity === 0) pen.move(command, []);
    for (let start = 0; start < values.length; start += arity) {
      const set = values.slice(start, start + arity);
      if (arity === 7 && reshapesArc(pen, set, command === "a")) return undefined;
      // After the first pair, a move's pairs are lines.
      const step =
        start > 0 && command.toUpperCase() === "M" ? (command === "m" ? "l" : "L") : command;
      pen.move(
        step,
        set.map(({ exact }) => exact),
      );
    }
    segments.push(command + values.map(({ text }) => text).join(" "));
    cursor.skipWhitespace();
  }
  return segments.length === 0 ? undefined : segments.join("");
}

/** A list of numbers, `undefined` for anything else; used for points, view boxes and dashes. */
export function parseSvgNumberList(input: string, limits: SvgLogoLimits): string[] | undefined {
  const cursor = new Cursor(input);
  const values: string[] = [];
  cursor.skipWhitespace();
  while (!cursor.atEnd()) {
    const value = cursor.number(limits);
    if (value === undefined) return undefined;
    values.push(value);
    cursor.skipWhitespace();
    if (cursor.text.charCodeAt(cursor.position) === 0x2c) {
      cursor.position += 1;
      cursor.skipWhitespace();
      if (cursor.atEnd()) return undefined;
    }
  }
  return values;
}
