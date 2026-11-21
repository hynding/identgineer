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
  /(?<![\w.#-])[+-]?(?:\d*\.?\d+)(?:e[+-]?\d+)?(?:px|rem|em|ex|ch|cap|lh|rlh|vw|vh|vi|vb|svh|lvh|dvh|svw|lvw|dvw|vmin|vmax|cm|mm|q|in|pt|pc)\b/gi;

const PHYSICAL_PROPERTY =
  /^(?:(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right|top|bottom)(?:-[a-z]+)*|left|right|top|bottom|(?:min-|max-)?(?:width|height)|overflow-[xy]|float|clear)$/;

// Properties whose keywords can name a side. Their values may not.
const DIRECTIONAL_KEYWORDS =
  /^(?:text-align|text-align-last|float|clear|justify-content|justify-items|justify-self|align-content)$/;
const DIRECTIONAL = /\b(?:left|right)\b/;

// Shorthands that take one value per side. One value and two (block, inline) say the same in
// either text direction, but three and four are ordered top, right, bottom, left.
const SIDED_SHORTHANDS =
  /^(?:margin|padding|inset|border-width|border-style|border-color|scroll-margin|scroll-padding)$/;
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
    } else if (!inValue) {
      inValue = true;
      count += 1;
    }
  }
  return count;
}

const VIEWPORT_QUERY = /@media[^{]*\b(?:(?:min|max)-)?(?:width|height|aspect-ratio)\b/gi;
const DECLARATION = /([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g;

function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

function lineAt(css: string, index: number): number {
  return css.slice(0, index).split("\n").length;
}

/**
 * The layout primitives arrange content in a container of unknown size, so they take every length
 * from a token (a zero is allowed), address the axes logically so they mirror in right-to-left,
 * and react to their container, never to the viewport.
 *
 * Refused: lengths with a unit; physical properties; `left` and `right` as the value of a
 * property that takes them; margin, padding, inset, border-width, border-style, border-color and
 * scroll-margin or scroll-padding with three or four values, and any border-radius with more than
 * one value, because those are ordered by physical side or corner. One and two values are allowed.
 * Not checked: keywords in other properties such as `background-position`.
 */
export function findLayoutCssViolations(source: string): LayoutCssViolation[] {
  const css = blankComments(source);
  const violations: LayoutCssViolation[] = [];

  for (const query of css.matchAll(VIEWPORT_QUERY)) {
    violations.push({
      line: lineAt(css, query.index),
      text: query[0].trim(),
      rule: "viewport media query",
    });
  }
  for (const declaration of css.matchAll(DECLARATION)) {
    const property = (declaration[1] ?? "").toLowerCase();
    const value = declaration[2] ?? "";
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
      (CORNER_SHORTHANDS.test(property) && (count > 1 || value.includes("/")))
    ) {
      violations.push({ line, text: `${property}: ${value.trim()}`, rule: "physical shorthand" });
    }
    for (const length of value.matchAll(LENGTH)) {
      if (parseFloat(length[0]) !== 0) {
        violations.push({ line, text: length[0], rule: "hard-coded length" });
      }
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}
