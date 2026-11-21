export interface LayoutCssViolation {
  line: number;
  text: string;
  rule: "hard-coded length" | "physical property" | "physical value" | "viewport media query";
}

// A length with a unit. 0, percentages, `fr` and unitless numbers are structural and pass.
const LENGTH =
  /(?<![\w.#-])\d*\.?\d+(?:px|rem|em|ex|ch|cap|lh|rlh|vw|vh|vi|vb|svh|lvh|dvh|svw|lvw|dvw|vmin|vmax|cm|mm|q|in|pt|pc)\b/gi;

const PHYSICAL_PROPERTY =
  /^(?:(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right|top|bottom)(?:-[a-z]+)*|left|right|top|bottom|(?:min-|max-)?(?:width|height)|overflow-[xy]|float|clear)$/;

const PHYSICAL_VALUE = /^(?:text-align|float|clear)$/;
const DIRECTIONAL = /\b(?:left|right)\b/;

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
 * from a token, address the axes logically so they mirror in right-to-left, and react to their
 * container, never to the viewport.
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
    if (PHYSICAL_VALUE.test(property) && DIRECTIONAL.test(value)) {
      violations.push({ line, text: `${property}: ${value.trim()}`, rule: "physical value" });
    }
    for (const length of value.matchAll(LENGTH)) {
      violations.push({ line, text: length[0], rule: "hard-coded length" });
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}
