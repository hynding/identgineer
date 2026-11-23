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

  skipSeparators(): void {
    while (this.position < this.text.length) {
      const unit = this.text.charCodeAt(this.position);
      if (!isXmlWhitespace(unit) && unit !== 0x2c) return;
      this.position += 1;
    }
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
      cursor.skipSeparators();
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
      cursor.position = before;
      return values;
    }
  }
}

/**
 * Path data by the SVG grammar, written back canonically: each command letter as written, its
 * numbers normalised and separated by single spaces, repeated coordinate pairs kept under one
 * letter. It must start with a move; anything outside the grammar is `undefined`.
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
