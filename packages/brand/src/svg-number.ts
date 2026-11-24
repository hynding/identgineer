import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";

const MAX_EXPONENT_DIGITS = 3;
const MAX_EXPONENT = 38;

function isDigit(unit: number): boolean {
  return unit >= 0x30 && unit <= 0x39;
}

function digitsFrom(text: string, start: number): number {
  let end = start;
  while (end < text.length && isDigit(text.charCodeAt(end))) end += 1;
  return end;
}

/**
 * The end of the SVG number starting at `start` (`[+-]? (digits ('.' digits)? | '.' digits)
 * ([eE] [+-]? digits)?`), or -1 if none starts there. An `e` not followed by digits ends the number
 * before it, as in path data, and so does a point not followed by digits: Chromium takes neither
 * `100.` nor `1.e2` as a number, anywhere.
 */
export function scanNumber(text: string, start: number): number {
  let position = start;
  const sign = text.charCodeAt(position);
  if (sign === 0x2b || sign === 0x2d) position += 1;
  const integerEnd = digitsFrom(text, position);
  let end = integerEnd;
  if (text.charCodeAt(end) === 0x2e) {
    const fractionEnd = digitsFrom(text, end + 1);
    if (fractionEnd > end + 1) end = fractionEnd;
  }
  if (end === position) return -1;
  const marker = text.charCodeAt(end);
  if (marker === 0x65 || marker === 0x45) {
    let exponent = end + 1;
    const exponentSign = text.charCodeAt(exponent);
    if (exponentSign === 0x2b || exponentSign === 0x2d) exponent += 1;
    const exponentEnd = digitsFrom(text, exponent);
    if (exponentEnd > exponent) end = exponentEnd;
  }
  return end;
}

function increment(digits: string): string {
  const units = digits.split("");
  for (let index = units.length - 1; index >= 0; index -= 1) {
    if (units[index] === "9") {
      units[index] = "0";
      continue;
    }
    units[index] = String(Number(units[index]) + 1);
    return units.join("");
  }
  return `1${units.join("")}`;
}

/**
 * Writes a number token in its one canonical form, exactly, in decimal: at most
 * `limits.fractionDigits` after the point (rounded half away from zero), no exponent, no `+`, no
 * leading or trailing zeros, `0` for any zero. Works on the digits, never through a binary float, so
 * the same token always gives the same text and the text gives itself back. A number of
 * `limits.integerDigits` digits or more before the point, or a token longer than
 * `limits.numberLength`, refuses the document; `undefined` means the token is not a number.
 */
export function normaliseNumber(token: string, limits: SvgLogoLimits): string | undefined {
  if (token.length > limits.numberLength) {
    throw new SvgLogoRejection(
      "number-out-of-range",
      "has a number written with too many characters",
    );
  }
  if (token.length === 0 || scanNumber(token, 0) !== token.length) return undefined;
  const negative = token.startsWith("-");
  const unsigned = token.replace(/^[+-]/, "");
  const exponentAt = unsigned.search(/[eE]/);
  const mantissa = exponentAt === -1 ? unsigned : unsigned.slice(0, exponentAt);
  const exponentText = exponentAt === -1 ? "0" : unsigned.slice(exponentAt + 1);
  if (exponentText.replace(/^[+-]/, "").length > MAX_EXPONENT_DIGITS) {
    throw new SvgLogoRejection("number-out-of-range", "has a number with too large an exponent");
  }
  const point = mantissa.indexOf(".");
  const integerPart = point === -1 ? mantissa : mantissa.slice(0, point);
  const fractionPart = point === -1 ? "" : mantissa.slice(point + 1);
  // value = 0.<digits> x 10^pointAt, once leading zeros are gone.
  let digits = integerPart + fractionPart;
  let pointAt = integerPart.length + Number(exponentText);
  const leadingZeros = digits.length - digits.replace(/^0+/, "").length;
  digits = digits.slice(leadingZeros);
  pointAt -= leadingZeros;
  // Chromium's SVG number reader takes no exponent beyond 38, even on zero.
  const exponentTooLarge = Math.abs(Number(exponentText)) > MAX_EXPONENT;
  if (digits === "") return exponentTooLarge ? undefined : "0";
  if (pointAt > limits.integerDigits) {
    throw new SvgLogoRejection("number-out-of-range", "has a number too large in magnitude");
  }
  if (exponentTooLarge) return undefined;
  let whole = pointAt > 0 ? digits.slice(0, pointAt).padEnd(pointAt, "0") : "0";
  let fraction = pointAt >= 0 ? digits.slice(pointAt) : "0".repeat(-pointAt) + digits;
  if (fraction.length > limits.fractionDigits) {
    const roundUp = fraction.charCodeAt(limits.fractionDigits) >= 0x35;
    fraction = fraction.slice(0, limits.fractionDigits);
    if (roundUp) {
      const bumped = increment(whole + fraction);
      whole = bumped.slice(0, bumped.length - fraction.length);
      fraction = bumped.slice(bumped.length - fraction.length);
    }
  }
  fraction = fraction.replace(/0+$/, "");
  whole = whole.replace(/^0+(?=\d)/, "");
  if (whole.length > limits.integerDigits) {
    throw new SvgLogoRejection("number-out-of-range", "has a number too large in magnitude");
  }
  if (whole === "0" && fraction === "") return "0";
  return `${negative ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}`;
}
