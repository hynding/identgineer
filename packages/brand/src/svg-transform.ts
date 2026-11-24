import { isXmlWhitespace } from "./svg-characters.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { parseSvgNumberList } from "./svg-path-data.ts";

const ARITIES: Readonly<Record<string, readonly number[]>> = {
  matrix: [6],
  translate: [1, 2],
  scale: [1, 2],
  rotate: [1, 3],
  skewX: [1],
  skewY: [1],
};
const MAX_FUNCTIONS = 16;

function skipWhitespace(input: string, position: number): number {
  let end = position;
  while (end < input.length && isXmlWhitespace(input.charCodeAt(end))) end += 1;
  return end;
}

/**
 * An SVG transform list (`matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`, as SVG spells
 * them), read into one form: `name(a b)` items separated by single spaces, their numbers in plain
 * decimals (see `normaliseNumber`). At most 16 functions,
 * separated as Chromium separates them: white space with at most one comma, none before the first
 * or after the last. Anything else, CSS units included, is `undefined`.
 */
export function parseSvgTransform(input: string, limits: SvgLogoLimits): string | undefined {
  const items: string[] = [];
  let position = skipWhitespace(input, 0);
  while (position < input.length) {
    const open = input.indexOf("(", position);
    const close = input.indexOf(")", position);
    if (open === -1 || close === -1 || close < open) return undefined;
    let nameEnd = open;
    while (nameEnd > position && isXmlWhitespace(input.charCodeAt(nameEnd - 1))) nameEnd -= 1;
    const name = input.slice(position, nameEnd);
    const arities = Object.hasOwn(ARITIES, name) ? ARITIES[name] : undefined;
    if (arities === undefined) return undefined;
    const values = parseSvgNumberList(input.slice(open + 1, close), limits);
    if (values === undefined || !arities.includes(values.length)) return undefined;
    items.push(`${name}(${values.join(" ")})`);
    if (items.length > MAX_FUNCTIONS) return undefined;
    position = skipWhitespace(input, close + 1);
    if (input.charCodeAt(position) === 0x2c) {
      position = skipWhitespace(input, position + 1);
      if (position >= input.length) return undefined;
    }
  }
  return items.length === 0 ? undefined : items.join(" ");
}
