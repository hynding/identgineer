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
    return normaliseNumber(token, limits);
  }

  flag(): string | undefined {
    const unit = this.text[this.position];
    if (unit !== "0" && unit !== "1") return undefined;
    this.position += 1;
    return unit;
  }
}

function readArguments(
  cursor: Cursor,
  command: string,
  limits: SvgLogoLimits,
): string[] | undefined {
  const arity = ARITY[command.toUpperCase()] ?? 0;
  const values: string[] = [];
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
      values.push(value);
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

/**
 * Path data by the SVG grammar, read into one form: each command letter as written, its numbers in
 * plain decimals (see `normaliseNumber`) separated by single spaces, repeated coordinate pairs kept
 * under one letter. It must start with a move; anything outside the grammar is `undefined`.
 */
export function parseSvgPathData(input: string, limits: SvgLogoLimits): string | undefined {
  const cursor = new Cursor(input);
  const segments: string[] = [];
  cursor.skipWhitespace();
  while (!cursor.atEnd()) {
    const command = input[cursor.position] ?? "";
    if (!Object.hasOwn(ARITY, command.toUpperCase()) || command.length !== 1) return undefined;
    if (segments.length === 0 && command !== "M" && command !== "m") return undefined;
    cursor.position += 1;
    const values = readArguments(cursor, command, limits);
    if (values === undefined) return undefined;
    segments.push(command + values.join(" "));
    cursor.skipWhitespace();
  }
  return segments.length === 0 ? undefined : segments.join("");
}

/** A number of a list: as the sanitiser keeps it, and as it was written. */
interface ListedNumber {
  readonly value: string;
  readonly spelling: string;
}

function scanNumberList(input: string, limits: SvgLogoLimits): ListedNumber[] | undefined {
  const cursor = new Cursor(input);
  const numbers: ListedNumber[] = [];
  cursor.skipWhitespace();
  while (!cursor.atEnd()) {
    const start = cursor.position;
    const value = cursor.number(limits);
    if (value === undefined) return undefined;
    numbers.push({ value, spelling: input.slice(start, cursor.position) });
    cursor.skipWhitespace();
    if (cursor.text.charCodeAt(cursor.position) === 0x2c) {
      cursor.position += 1;
      cursor.skipWhitespace();
      if (cursor.atEnd()) return undefined;
    }
  }
  return numbers;
}

/**
 * A list of numbers, `undefined` for anything else; used for points, view boxes and the arguments
 * of a transform function.
 */
export function parseSvgNumberList(input: string, limits: SvgLogoLimits): string[] | undefined {
  return scanNumberList(input, limits)?.map(({ value }) => value);
}

/**
 * Each number of a list as it was written, split where the list's grammar splits it (`-10-10` is
 * two numbers); `undefined` for anything that is not a list of numbers.
 */
export function svgNumberSpellings(input: string, limits: SvgLogoLimits): string[] | undefined {
  return scanNumberList(input, limits)?.map(({ spelling }) => spelling);
}
