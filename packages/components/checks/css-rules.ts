export interface CssViolation {
  line: number;
  text: string;
  rule: string;
}

const COLOUR_RULES = [
  { rule: "colour literal", pattern: /#[0-9a-f]{3,8}\b/gi },
  { rule: "colour literal", pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi },
  { rule: "raw duration", pattern: /(?<![\w.])(?<![a-z]-)\d*\.?\d+m?s\b/gi },
] as const;

// Only declaration values are scanned, so a class like `.items-2s` is not mistaken for a duration.
const DECLARATION = /([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g;

function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

function lineAt(css: string, index: number): number {
  return css.slice(0, index).split("\n").length;
}

/**
 * Components take every colour and duration from --idg-* tokens. System colour keywords such as
 * ButtonText are allowed because forced-colors mode requires them.
 */
export function findCssViolations(source: string): CssViolation[] {
  const css = blankComments(source);
  const violations: CssViolation[] = [];
  for (const declaration of css.matchAll(DECLARATION)) {
    const value = declaration[2] ?? "";
    const valueStart = declaration.index + declaration[0].length - value.length;
    for (const { rule, pattern } of COLOUR_RULES) {
      for (const match of value.matchAll(pattern)) {
        violations.push({
          line: lineAt(css, valueStart + match.index),
          text: match[0],
          rule,
        });
      }
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}
