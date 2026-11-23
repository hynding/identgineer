import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo, sanitiseSvgLogoWithLimits } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoResult } from "./svg-logo-result.ts";
import { findSanitisedSvgProblems } from "./svg-output-check.ts";

const ELEMENTS = [
  // Allowed.
  "g",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
  "use",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "title",
  "desc",
  // Not allowed, or allowed only in another casing or namespace.
  "script",
  "Script",
  "SCRIPT",
  "svg:script",
  "html:script",
  "foreignObject",
  "foreignobject",
  "image",
  "feImage",
  "filter",
  "a",
  "animate",
  "set",
  "animateTransform",
  "style",
  "text",
  "tspan",
  "metadata",
  "iframe",
  "svg",
  "svg:path",
  "Path",
  "sodipodi:namedview",
  "pattern",
  "symbol",
  "html:img",
];

const ATTRIBUTES = [
  "id",
  "id",
  "d",
  "x",
  "y",
  "width",
  "height",
  "r",
  "cx",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "transform",
  "href",
  "href",
  "xlink:href",
  "clip-path",
  "mask",
  "offset",
  "stop-color",
  "style",
  "viewBox",
  "gradientUnits",
  "display",
  // Not allowed.
  "onload",
  "ONLOAD",
  "onClick",
  "class",
  "xml:base",
  "xlink:actuate",
  "sodipodi:type",
  "attributeName",
  "to",
  "src",
  "filter",
  "data-x",
  "svg:onload",
];

const IDS = ["a", "b", "c", "d"];

const VALUES = [
  // Valid somewhere.
  "0",
  "1",
  "-2.5",
  "1e2",
  "50%",
  "10px",
  "3mm",
  "#a",
  "#b",
  "#c",
  "#zz",
  "url(#a)",
  "url(#b)",
  "url('#c')",
  "url(#d)",
  "none",
  "red",
  "#fff",
  "#4F46E5",
  "rgb(1, 2, 3)",
  "currentColor",
  "M0 0L10 10Z",
  "m1.5.5 2-2h3v4a1 1 0 0 1 2 2z",
  "0,0 10,10 20,0",
  "translate(1 2) scale(2)",
  "matrix(1,0,0,1,0,0)",
  "0 0 10 10",
  "userSpaceOnUse",
  "fill:red;stroke:url(#a)",
  "stroke-width:2;fill:url(https://x.invalid/#a)",
  "inline",
  "a",
  "b",
  // Hostile.
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "java\tscript:alert(1)",
  "data:image/svg+xml,<svg onload=alert(1)>",
  "https://attacker.invalid/x.svg#a",
  "url(javascript:alert(1))",
  "url(https://attacker.invalid/#a)",
  "expression(alert(1))",
  '" onload="alert(1)',
  "' onload='alert(1)",
  "</title><script>alert(1)</script>",
  "&lt;script&gt;",
  "-moz-binding:url(x)",
  "@import url(x)",
  "1e999",
  "99999999",
  "0.0000000000000000000000000000000001",
  "#a b",
  "url(#a",
  "é\u2028",
];

const TEXTS = [
  "Logo",
  "A & B",
  "<script>alert(1)</script>",
  "]] >",
  "été",
  "+ADw-script+AD4-",
  " ",
  "\n  ",
  "x\ry",
];

interface Node {
  readonly name: string;
  readonly attributes: readonly (readonly [string, string])[];
  readonly children: readonly Node[];
  readonly text: string | undefined;
}

class Generator {
  readonly random: () => number;

  constructor(seed: number) {
    this.random = seeded(seed);
  }

  chance(probability: number): boolean {
    return this.random() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)] as T;
  }

  attributes(): [string, string][] {
    const chosen = new Map<string, string>();
    const count = Math.floor(this.random() * 5);
    for (let index = 0; index < count; index += 1) {
      const name = this.pick(ATTRIBUTES);
      const value = name === "id" ? this.pick(IDS) : this.pick(VALUES);
      chosen.set(name, value);
    }
    return [...chosen];
  }

  node(depth: number): Node {
    const name = this.pick(ELEMENTS);
    const children: Node[] = [];
    if (depth > 0) {
      const count = Math.floor(this.random() * 4);
      for (let index = 0; index < count; index += 1) children.push(this.node(depth - 1));
    }
    return {
      name,
      attributes: this.attributes(),
      children,
      text: this.chance(0.3) ? this.pick(TEXTS) : undefined,
    };
  }

  space(): string {
    return this.pick([" ", "  ", "\n", "\t", "\n    "]);
  }

  /** Writes a value with a random quote, escaping what must be and encoding some of the rest. */
  value(value: string): string {
    const quote = this.chance(0.5) ? '"' : "'";
    let written = "";
    for (const character of value) {
      const mustEscape = character === "<" || character === "&" || character === quote;
      if (mustEscape || this.chance(0.08)) {
        const code = character.codePointAt(0) ?? 0;
        written += this.pick([
          `&#${String(code)};`,
          `&#x${code.toString(16)};`,
          `&#X${code.toString(16)};`.replace("X", "x"),
          ...(character === "<" ? ["&lt;"] : character === "&" ? ["&amp;"] : []),
          ...(character === '"' ? ["&quot;"] : character === "'" ? ["&apos;"] : []),
        ]);
      } else {
        written += character;
      }
    }
    return `${quote}${written}${quote}`;
  }

  text(text: string): string {
    if (this.chance(0.3) && !text.includes("]]>")) return `<![CDATA[${text}]]>`;
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("]]>", "]]&gt;");
  }

  write(node: Node): string {
    const name = this.chance(0.03) ? node.name.toUpperCase() : node.name;
    let output = `<${name}`;
    for (const [attribute, value] of node.attributes) {
      output += `${this.space()}${attribute}${this.chance(0.2) ? " = " : "="}${this.value(value)}`;
    }
    if (this.chance(0.1)) output += this.space();
    const inner =
      (node.text === undefined ? "" : this.text(node.text)) +
      node.children
        .map((child) => (this.chance(0.1) ? "<!-- note -->" : "") + this.write(child))
        .join(this.chance(0.5) ? "\n" : "");
    if (inner === "" && this.chance(0.5)) return `${output}/>`;
    return `${output}>${inner}</${name}>`;
  }

  document(): string {
    const root: Node = {
      name: "svg",
      attributes: [
        ...(this.chance(0.9)
          ? [["viewBox", this.chance(0.95) ? "0 0 100 100" : this.pick(VALUES)] as const]
          : []),
        ...this.attributes().filter(([name]) => name !== "viewBox"),
      ],
      children: Array.from({ length: 1 + Math.floor(this.random() * 4) }, () => this.node(3)),
      text: undefined,
    };
    const declarations = [
      this.chance(0.9) ? ' xmlns="http://www.w3.org/2000/svg"' : "",
      ' xmlns:xlink="http://www.w3.org/1999/xlink"',
      ' xmlns:svg="http://www.w3.org/2000/svg"',
      ' xmlns:html="http://www.w3.org/1999/xhtml"',
      ' xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"',
    ].join("");
    const body = this.write(root).replace(/^<svg/i, (open) => `${open}${declarations}`);
    return (this.chance(0.3) ? '<?xml version="1.0" encoding="UTF-8"?>\n' : "") + body;
  }
}

function sanitiseOrFail(input: string | Uint8Array, where: string): SvgLogoResult {
  let result: SvgLogoResult | undefined;
  expect(() => (result = sanitiseSvgLogo(input)), where).not.toThrow();
  if (result === undefined) throw new Error(where);
  if (!result.ok) expect(result.errors[0]?.code, where).not.toBe("internal-error");
  return result;
}

function checkAccepted(result: SvgLogoResult, input: string | Uint8Array, where: string): boolean {
  if (!result.ok) return false;
  expect(findSanitisedSvgProblems(result.svg), where).toEqual([]);
  const again = sanitiseSvgLogo(result.svg);
  expect(again.ok && again.svg, `${where}: idempotence`).toBe(result.svg);
  expect(again.ok && again.removedCount, `${where}: nothing left to remove`).toBe(0);
  expect(result.drawingCost, `${where}: within the cost limit`).toBeLessThanOrEqual(
    SVG_LOGO_LIMITS.drawingCost,
  );
  expect(again.ok && again.drawingCost, `${where}: the same cost read again`).toBe(
    result.drawingCost,
  );
  const repeat = sanitiseSvgLogo(input);
  expect(repeat.ok && repeat.svg, `${where}: determinism`).toBe(result.svg);
  return true;
}

describe("sanitiseSvgLogo, random documents", () => {
  it("never throws, and every accepted output is valid, idempotent and deterministic, over 20,000 random trees", () => {
    const seed = 20_261_123;
    const generator = new Generator(seed);
    let accepted = 0;
    const runs = 20_000;
    for (let run = 0; run < runs; run += 1) {
      const input = generator.document();
      const where = `seed ${String(seed)}, run ${String(run)}`;
      if (checkAccepted(sanitiseOrFail(input, where), input, where)) accepted += 1;
    }
    // The pool is mostly valid SVG, so most documents are accepted with something removed.
    expect(accepted).toBeGreaterThan(runs * 0.3);
  }, 120_000);

  it("returns a result for any string or bytes, unpaired surrogates and invalid UTF-8 included", () => {
    const seed = 7_331;
    const random = seeded(seed);
    const pieces = [
      "<svg",
      "<",
      ">",
      "/>",
      "</svg>",
      "&",
      "&#x41;",
      "\uD800",
      "\uDC00",
      "\0",
      "<!--",
      "-->",
      "<![CDATA[",
      "]]>",
      "<?",
      "=",
      '"',
      "'",
      " ",
      'xmlns="http://www.w3.org/2000/svg"',
      'viewBox="0 0 1 1"',
      "<g>",
      "</g>",
    ];
    for (let run = 0; run < 5_000; run += 1) {
      const where = `seed ${String(seed)}, run ${String(run)}`;
      const length = Math.floor(random() * 40);
      let text = "";
      for (let index = 0; index < length; index += 1) {
        text +=
          random() < 0.5
            ? String.fromCharCode(Math.floor(random() * 0x10000))
            : (pieces[Math.floor(random() * pieces.length)] ?? "");
      }
      checkAccepted(sanitiseOrFail(text, where), text, where);
      const bytes = Uint8Array.from({ length }, () => Math.floor(random() * 256));
      checkAccepted(sanitiseOrFail(bytes, where), bytes, where);
    }
  }, 60_000);

  it("handles every clean logo mutated at random: cut, doubled or with hostile text spliced in", () => {
    const corpus = new URL("./__fixtures__/clean-svg/", import.meta.url);
    const logos = readdirSync(fileURLToPath(corpus)).map((file) =>
      readFileSync(new URL(file, corpus), "utf8"),
    );
    const splices = [
      "<script>alert(1)</script>",
      ' onload="alert(1)"',
      "<!--",
      "]]>",
      "&",
      "<",
      '"',
      "<g>",
      "</g>",
      "\0",
      "\uD800",
      'href="javascript:alert(1)"',
      "<!DOCTYPE x>",
      "&#x0;",
    ];
    const seed = 99;
    const random = seeded(seed);
    for (let run = 0; run < 5_000; run += 1) {
      const logo = logos[run % logos.length] ?? "";
      const at = Math.floor(random() * logo.length);
      const to = Math.min(logo.length, at + Math.floor(random() * 20));
      const kind = Math.floor(random() * 3);
      const mutated =
        kind === 0
          ? logo.slice(0, at) + logo.slice(to)
          : kind === 1
            ? logo.slice(0, to) + logo.slice(at)
            : logo.slice(0, at) +
              (splices[Math.floor(random() * splices.length)] ?? "") +
              logo.slice(at);
      const where = `seed ${String(seed)}, run ${String(run)}`;
      checkAccepted(sanitiseOrFail(mutated, where), mutated, where);
    }
  }, 60_000);
});

describe("sanitiseSvgLogo, linear time", () => {
  // The public limit refuses these sizes outright; raising it shows the reader itself stays linear.
  const limits = {
    ...SVG_LOGO_LIMITS,
    inputBytes: 4 * 1024 * 1024,
    elements: 1_000_000,
    attributesPerElement: 1_000_000,
    attributeValueLength: 2 * 1024 * 1024,
    pathDataLength: 2 * 1024 * 1024,
    textLength: 2 * 1024 * 1024,
    ids: 1_000_000,
    renderedElements: 10_000_000,
    drawingCost: Number.MAX_SAFE_INTEGER,
    maskApplications: Number.MAX_SAFE_INTEGER,
  };
  const MEGABYTE = 1024 * 1024;
  const fill = (unit: string): string => unit.repeat(Math.ceil(MEGABYTE / unit.length));
  const root = (body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${body}</svg>`;

  it.each([
    ["ampersands with no reference", root(`<title>${fill("&")}</title>`)],
    ["unterminated references", root(`<title>${fill("&#x41")}</title>`)],
    ["character references", root(`<title>${fill("&#x41;")}</title>`)],
    ["an unclosed comment", root(`<!--${fill("- ")}`)],
    ["comments", root(fill("<!-- x -->"))],
    ["an unclosed CDATA section", root(`<title><![CDATA[${fill("]")}`)],
    ["empty elements", root(fill('<path d="M0 0"/>'))],
    [
      "attributes",
      root(
        `<g ${Array.from({ length: MEGABYTE / 10 }, (_, index) => `a${String(index)}="1"`).join(" ")}/>`,
      ),
    ],
    ["nesting at the depth limit, over and over", root(fill("<g>".repeat(30) + "</g>".repeat(30)))],
    ["one long path", root(`<path d="M0 0${fill(" 1.5-2.5e1")}"/>`)],
    ["one long path of bare signs", root(`<path d="M0 0${fill("-")}"/>`)],
    ["one long attribute of digits", root(`<rect width="${fill("9")}"/>`)],
    ["an unclosed attribute", root(`<g fill="${fill("a")}`)],
    ["a long style attribute", root(`<g style="${fill("fill:red;")}"/>`)],
    ["a long transform", root(`<g transform="${fill("scale(1)")}"/>`)],
    ["a long point list", root(`<polygon points="${fill("1,2 ")}"/>`)],
    ["many uses of one group", root(`<g id="g"/>${fill('<use href="#g"/>')}`)],
    [
      "many uses of one masked path",
      root(
        `<mask id="m"/><path id="p" d="M0 0 1 1" mask="url(#m)" stroke-dasharray="1"/>${fill('<use href="#p"/>')}`,
      ),
    ],
    [
      "one long path of arcs, dashed",
      root(`<path d="M0 0${fill("A1 2 3 0 1 4 5")}" stroke-dasharray="0.1"/>`),
    ],
    ["unclosed tags", fill("<g>")],
    ["a run of less-than signs", fill("<")],
    ["a run of greater-than signs", root(fill(">"))],
    ["one long name", `<${fill("a")}/>`],
  ])("reads a megabyte of %s in linear time", (_label, input) => {
    const started = performance.now();
    const result = sanitiseSvgLogoWithLimits(input, undefined, limits);
    const elapsed = performance.now() - started;
    expect(result.ok || result.errors[0]?.code).not.toBe("internal-error");
    // About half a second at most on a laptop; anything quadratic would take minutes.
    expect(elapsed).toBeLessThan(3_000);
  });
});
