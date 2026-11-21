export interface SourceViolation {
  line: number;
  rule: string;
  text: string;
}

const RULES = [
  { rule: "innerHTML", pattern: /\binnerHTML\b/g },
  { rule: "outerHTML", pattern: /\bouterHTML\b/g },
  { rule: "insertAdjacentHTML", pattern: /\binsertAdjacentHTML\b/g },
  { rule: "document.write", pattern: /\bdocument\s*\.\s*write(?:ln)?\b/g },
  { rule: "srcdoc", pattern: /\bsrcdoc\b/gi },
  { rule: "eval", pattern: /(?<![\w$])eval\s*\(/g },
  { rule: "Function constructor", pattern: /(?<![\w$.])(?:new\s+)?Function\s*\(/g },
  { rule: "string timer", pattern: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/g },
  // A handler must be a function, which Stencil attaches with addEventListener. A string would
  // become an inline handler attribute, which a script-src CSP blocks.
  { rule: "string event handler", pattern: /\bon[A-Za-z]+\s*=\s*(?:["']|\{\s*`)/g },
  { rule: "string event handler", pattern: /setAttribute\s*\(\s*["']on[A-Za-z]+["']/gi },
  // Style is set through tokens in the stylesheet. An inline style string needs style-src
  // 'unsafe-inline' and would let a prop smuggle declarations in.
  { rule: "inline style string", pattern: /\bstyle\s*=\s*(?:["']|\{\s*`)/g },
  { rule: "inline style string", pattern: /setAttribute\s*\(\s*["']style["']/g },
  { rule: "inline style string", pattern: /\bcssText\b/g },
  { rule: "javascript url", pattern: /javascript:/gi },
] as const;

function blankComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, (_match, before: string) => before);
}

/** Scans a TypeScript or TSX component source for APIs that open an injection or CSP hole. */
export function findSourceViolations(source: string): SourceViolation[] {
  const code = blankComments(source);
  const violations: SourceViolation[] = [];
  for (const { rule, pattern } of RULES) {
    for (const match of code.matchAll(pattern)) {
      violations.push({
        line: code.slice(0, match.index).split("\n").length,
        rule,
        text: match[0],
      });
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}
