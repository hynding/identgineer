export interface LayoutCssViolation {
  line: number;
  text: string;
  rule:
    | "hard-coded length"
    | "physical property"
    | "physical shorthand"
    | "physical value"
    | "viewport media query";
}

// A length with a unit, signed or in exponent form. Percentages, `fr` and unitless numbers are
// structural and pass, and so does a zero, which is a length with no size to hard-code. The
// lookbehind keeps a custom property name such as `--space-4px` from being read as a length.
const LENGTH =
  /(?<![\w.#-])[+-]?(?:\d*\.?\d+)(?:e[+-]?\d+)?(?:px|rem|em|ex|ch|ic|cap|lh|rex|rch|ric|rcap|rlh|vw|vh|vi|vb|vmin|vmax|[sld]v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max)|cm|mm|q|in|pt|pc)\b/gi;

const PHYSICAL_PROPERTY =
  /^(?:(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right|top|bottom)(?:-[a-z]+)*|left|right|top|bottom|(?:min-|max-)?(?:width|height)|overflow-[xy]|clip)$/;

// Properties whose keywords can name a side. Their values may not.
const DIRECTIONAL_KEYWORDS =
  /^(?:text-align|text-align-last|float|clear|justify-content|justify-items|justify-self|align-content|place-items|place-content|place-self)$/;
const DIRECTIONAL = /\b(?:left|right)\b/i;

// Shorthands that take one value per side. One value and two (block, inline) say the same in
// either text direction, but three and four are ordered top, right, bottom, left.
const SIDED_SHORTHANDS =
  /^(?:margin|padding|inset|border-width|border-style|border-color|scroll-margin|scroll-padding)$/;
// `overflow` takes x then y, so two values are physical.
const AXIS_SHORTHANDS = /^overflow$/;
// The inset() of a shape takes a value per side, and its radii one per corner, so more than two
// sides or more than one radius are ordered physically. rect() and xywh() are ordered by side or
// by x and y whatever their count.
const SHAPE_PROPERTIES = /^(?:clip-path|shape-outside)$/;
const PHYSICAL_SHAPE = /\b(?:rect|xywh)\(/i;
// A radius is ordered by corner, so even two values name physical corners.
const CORNER_SHORTHANDS = /^border-radius$/;

/** The values of a shorthand, split on spaces that are not inside a function. */
function countValues(value: string): number {
  let depth = 0;
  let count = 0;
  let inValue = false;
  for (const character of value.trim()) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (/\s/.test(character) && depth === 0) {
      inValue = false;
    } else if (character === ")" && depth === 0) {
      // A function ends a value even with nothing after it, so `var(--a)var(--b)` is two.
      inValue = false;
    } else if (!inValue) {
      inValue = true;
      count += 1;
    }
  }
  return count;
}

/** The arguments of the first call of a function in a value, with nested calls kept whole. */
function argumentsOf(value: string, name: string): string | undefined {
  const start = value.search(new RegExp(`\\b${name}\\(`, "i"));
  if (start < 0) return undefined;
  const open = start + name.length + 1;
  let depth = 1;
  for (let index = open; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    if (value[index] === ")") depth -= 1;
    if (depth === 0) return value.slice(open, index);
  }
  return value.slice(open);
}

/** Whether an inset() names more than two sides, more than one radius, or an elliptical one. */
function isPhysicalInset(value: string): boolean {
  const [sides = "", radius] = (argumentsOf(value, "inset") ?? "").split(/\s+round\s+/i);
  return (
    countValues(sides) > 2 ||
    (radius !== undefined && (countValues(radius) > 1 || radius.includes("/")))
  );
}

const VIEWPORT_QUERY =
  /@media[^{]*\b(?:(?:(?:min|max)-)?(?:width|height|aspect-ratio)|orientation)\b/gi;
const PRELUDE = /@(?:media|container)\b([^{}]*)\{/gi;
const DECLARATION = /([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g;

// Comments and the inside of strings are not css, so `content: "@media (min-width: 0) {"` is not
// read as a query. Blanking keeps every offset, so line numbers stay true.
const COMMENT_OR_STRING = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;

function blankCommentsAndStrings(css: string): string {
  return css.replace(COMMENT_OR_STRING, (text) =>
    text.startsWith("/")
      ? text.replace(/[^\n]/g, " ")
      : `${text[0] ?? ""}${" ".repeat(text.length - 2)}${text[0] ?? ""}`,
  );
}

function lineAt(css: string, index: number): number {
  return css.slice(0, index).split("\n").length;
}

/**
 * The layout primitives arrange content in a container of unknown size, so they take every length
 * from a token (a zero is allowed), address the axes logically so they mirror in right-to-left,
 * and react to their container, never to the viewport.
 *
 * Refused: lengths with a unit, in a declaration or in the prelude of `@container` and `@media`;
 * physical properties, including the legacy `clip`; `left` and `right`, in any case, as the value
 * of a property that takes them (`text-align`, `justify-*`, `place-*`, `float`, `clear` and the
 * like; `inline-start` and `inline-end` are fine); margin, padding, inset, border-width,
 * border-style, border-color and scroll-margin or scroll-padding with three or four values, and
 * any border-radius with more than one value, because those are ordered by physical side or
 * corner; the same for shapes: `rect()` and `xywh()`, and an `inset()` with more than two sides
 * or more than one radius, in `clip-path` and `shape-outside`; a two-value `overflow`, which is
 * ordered x then y; and a viewport media query, which includes `orientation` (a container query
 * may use it). One and two values are allowed, `!important` is not counted as a value, an
 * exponent in a length is refused whatever it works out to, and strings and comments are not read.
 * Not checked: keywords in other properties such as `background-position`.
 */
export function findLayoutCssViolations(source: string): LayoutCssViolation[] {
  const css = blankCommentsAndStrings(source);
  const violations: LayoutCssViolation[] = [];

  for (const query of css.matchAll(VIEWPORT_QUERY)) {
    violations.push({
      line: lineAt(css, query.index),
      text: query[0].trim(),
      rule: "viewport media query",
    });
  }
  for (const prelude of css.matchAll(PRELUDE)) {
    for (const length of (prelude[1] ?? "").matchAll(LENGTH)) {
      violations.push({
        line: lineAt(css, prelude.index),
        text: length[0],
        rule: "hard-coded length",
      });
    }
  }
  for (const declaration of css.matchAll(DECLARATION)) {
    const property = (declaration[1] ?? "").toLowerCase();
    const value = (declaration[2] ?? "").replace(/\s*!\s*important\s*$/i, "");
    const line = lineAt(css, declaration.index);
    if (PHYSICAL_PROPERTY.test(property)) {
      violations.push({ line, text: property, rule: "physical property" });
    }
    if (DIRECTIONAL_KEYWORDS.test(property) && DIRECTIONAL.test(value)) {
      violations.push({ line, text: `${property}: ${value.trim()}`, rule: "physical value" });
    }
    const count = countValues(value);
    if (
      (SIDED_SHORTHANDS.test(property) && count > 2) ||
      (AXIS_SHORTHANDS.test(property) && count > 1) ||
      (CORNER_SHORTHANDS.test(property) && (count > 1 || value.includes("/"))) ||
      (SHAPE_PROPERTIES.test(property) && (PHYSICAL_SHAPE.test(value) || isPhysicalInset(value)))
    ) {
      violations.push({ line, text: `${property}: ${value.trim()}`, rule: "physical shorthand" });
    }
    for (const length of value.matchAll(LENGTH)) {
      // An exponent is refused whatever it works out to, so `1e-400px` is not read as a zero.
      if (/\de[+-]?\d/i.test(length[0]) || parseFloat(length[0]) !== 0) {
        violations.push({ line, text: length[0], rule: "hard-coded length" });
      }
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}
