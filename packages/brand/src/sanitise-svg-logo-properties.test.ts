import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo, sanitiseSvgLogoWithLimits } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoResult } from "./svg-logo-result.ts";
import { SVG_ELEMENT_RULES, type SvgElementName } from "./svg-allowlist.ts";
import { SVG_GRAMMARS } from "./svg-values.ts";
import { expectSettledLogo } from "./test-support.ts";

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
  // At the length limit in characters, and longer once escaped.
  ">".repeat(2048),
  '"Acme" & > '.repeat(186),
  // At the limit in code points, twice as long in UTF-16 units.
  "😀".repeat(2048),
  "a𝄞".repeat(1024),
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
  expectSettledLogo(result.svg, where);
  const again = sanitiseSvgLogo(result.svg);
  expect(again.ok && again.svg, `${where}: idempotence`).toBe(result.svg);
  expect(again.ok && again.removedCount, `${where}: nothing left to remove`).toBe(0);
  expect(result.drawingCost, `${where}: within the cost limit`).toBeLessThanOrEqual(
    SVG_LOGO_LIMITS.drawingCost,
  );
  expect(again.ok && again.drawingCost, `${where}: the same cost read again`).toBe(
    result.drawingCost,
  );
  expect(result.overdraw, `${where}: within the overdraw limit`).toBeLessThanOrEqual(
    SVG_LOGO_LIMITS.overdraw,
  );
  expect(again.ok && again.overdraw, `${where}: the same overdraw read again`).toBe(
    result.overdraw,
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

/**
 * Values from just outside the grammars: keywords from neighbouring specifications or another
 * attribute's list, case and spelling slips, units no grammar keeps, numbers and functions in forms
 * no grammar reads. Whatever the sanitiser keeps must pass the independent check, so a grammar that
 * starts accepting one of these (a unit, a keyword) is caught here even where no fixed test names it.
 */
const OUTSIDE_PIECES = [
  // Keywords: valid for some attribute, or near a valid one, or from CSS and SVG 2.
  "arcs",
  "miter-clip",
  "inherit",
  "initial",
  "unset",
  "revert",
  "auto",
  "normal",
  "context-fill",
  "context-stroke",
  "non-scaling-stroke",
  "block",
  "contents",
  "optimizeQuality",
  "fill-box",
  "stroke-box",
  "view-box",
  "Round",
  "MITER",
  "EvenOdd",
  "Butt",
  "squared",
  "round",
  "bevel",
  "miter",
  "butt",
  "square",
  "evenodd",
  "nonzero",
  "inline",
  "hidden",
  "collapse",
  "luminance",
  "alpha",
  "pad",
  "reflect",
  "repeat",
  "userSpaceOnUse",
  "objectBoundingBox",
  "crispEdges",
  "geometricPrecision",
  "transparent",
  "currentcolor",
  // Lengths in units no grammar keeps, and in some it does.
  "0.001em",
  "1ex",
  "2rem",
  "3vw",
  "4vh",
  "5vmin",
  "6vmax",
  "7ch",
  "8q",
  "9Q",
  "1lh",
  "1cap",
  "45deg",
  "1s",
  "1PX",
  "1%",
  "1px",
  "1mm",
  "1in",
  // Numbers and functions no grammar reads.
  "1e999",
  "--1",
  "1.2.3",
  "Infinity",
  "NaN",
  "0x10",
  "+-1",
  ".",
  "rgba(1,2,3,.5)",
  "hsl(1,2%,3%)",
  "#abcd",
  "var(--x)",
  "calc(1px + 1em)",
  "attr(x)",
  "env(x)",
  "url(#a) red",
  "url(#missing)",
  "rotate(45deg)",
  "translate(1px,2px)",
  "translate3d(1,2,3)",
  "perspective(1)",
  "M0 0 X1 1",
  "M0 0 L1",
  "M0 0a1 1 0 2 0 1 1",
  "xMidYMid meet slice",
  "",
  "1",
  "0",
  "-1",
];

/** Where each attribute may stand, so it is tried on an element that takes it. */
function hostFor(attribute: string, value: string): string {
  const on = `${attribute}="${value}"`;
  const rootOf = (rootAttributes: string, body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" ${rootAttributes}>${body}</svg>`;
  const sized = 'viewBox="0 0 10 10" width="10" height="10"';
  const drawn = (body: string): string => rootOf(sized, body);
  const host = HOSTS.find((name) => SVG_ELEMENT_RULES[name].attributes.includes(attribute));
  switch (host) {
    case "svg": {
      const others = sized.replace(new RegExp(`(^| )${attribute}="[^"]*"`), "");
      return rootOf(`${others} ${on}`, '<path d="M0 0H9" stroke="red"/>');
    }
    case "linearGradient":
    case "radialGradient":
      return drawn(
        `<defs><${host} id="g" ${on}><stop offset="0"/></${host}></defs><rect width="1" height="1" fill="url(#g)"/>`,
      );
    case "stop":
      return drawn(
        `<defs><linearGradient id="g"><stop ${on}/></linearGradient></defs><rect width="1" height="1" fill="url(#g)"/>`,
      );
    case "clipPath":
    case "mask":
      return drawn(
        `<defs><${host} id="m" ${on}><rect width="1" height="1"/></${host}></defs><rect width="1" height="1" ${host === "mask" ? "mask" : "clip-path"}="url(#m)"/>`,
      );
    case "use":
      return drawn(
        `<defs><path id="p" d="M0 0H1"/></defs><use ${attribute === "href" ? "" : 'href="#p" '}${on}/>`,
      );
    case undefined:
      throw new Error(`no element takes ${attribute}`);
    default:
      return drawn(attribute === "d" ? `<path ${on}/>` : `<${host} d="M0 0H9" ${on}/>`);
  }
}

const HOSTS = [
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "svg",
  "use",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "g",
] as const satisfies readonly SvgElementName[];

describe("sanitiseSvgLogo, values from outside each grammar", () => {
  it("drops and reports every value it does not keep, and keeps none the independent check refuses", () => {
    const seed = 15_003;
    const random = seeded(seed);
    const pick = (): string => OUTSIDE_PIECES[Math.floor(random() * OUTSIDE_PIECES.length)] ?? "";
    const separators = [" ", ",", ", ", ""];
    let tried = 0;
    let dropped = 0;
    const combined = (): string => {
      const count = 2 + Math.floor(random() * 2);
      const separator = separators[Math.floor(random() * separators.length)] ?? " ";
      return Array.from({ length: count }, pick).join(separator);
    };
    for (const attribute of Object.keys(SVG_GRAMMARS)) {
      // Every piece alone, then pieces run together, for every attribute.
      const values = [...OUTSIDE_PIECES, ...Array.from({ length: 100 }, combined)];
      for (const value of values) {
        const input = hostFor(attribute, value);
        const where = `seed ${String(seed)}, ${attribute}="${value}"`;
        const result = sanitiseOrFail(input, where);
        tried += 1;
        const reported = result.ok
          ? result.removed.some((removal) => removal.attribute === attribute)
          : result.errors.length > 0;
        if (reported) dropped += 1;
        else checkAccepted(result, input, where);
      }
    }
    // Most are outside their grammar by construction; the few kept are valid by the check above.
    expect(dropped).toBeGreaterThan(tried * 0.8);
  }, 60_000);
});

describe("sanitiseSvgLogo, linear time", () => {
  // The public limits refuse these sizes outright; raising them shows each stage stays linear on
  // the whole input, not only up to the first limit.
  const limits = {
    ...SVG_LOGO_LIMITS,
    inputBytes: 64 * 1024 * 1024,
    elements: 10_000_000,
    depth: 10_000_000,
    attributesPerElement: 1_000_000,
    attributeValueLength: 64 * 1024 * 1024,
    pathDataLength: 64 * 1024 * 1024,
    textLength: 64 * 1024 * 1024,
    nameLength: 64 * 1024 * 1024,
    ids: 1_000_000,
    renderedElements: 10_000_000,
    drawingCost: Number.MAX_SAFE_INTEGER,
    maskApplications: Number.MAX_SAFE_INTEGER,
  };
  const QUARTER_MEGABYTE = 256 * 1024;
  const root = (body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${body}</svg>`;
  type Fill = (unit: string) => string;

  // Linear growth has exponent 1 and quadratic 2; honest runs measured 0.9 to 1.3 on a quiet machine
  // and up to about 1.55 with four busy processes on four cores. The bound sits above that and clear of
  // quadratic: 16x the input may take up to 16 ** 1.7 (about 111) times as long, where linear takes
  // about 14 to 35 and quadratic 256.
  const GROWTH_EXPONENT_BOUND = 1.7;
  // A run shorter than this is mostly timer and scheduler noise, so it is counted as this long.
  const FLOOR_MILLISECONDS = 5;

  /**
   * The exponent k in time ~ size ** k, by least squares on the logarithms of the fastest of
   * several runs (three unless told otherwise) at each of three sizes. Runs are taken in turn across the sizes, so a pause for
   * garbage collection or another process counts less, and a busy spell slows all sizes alike.
   * Over a 16-fold span an honest 4 to 5.5 times per quadrupling (exponent about 1.2) stays far
   * from a quadratic stage (2); one 4x pair left a bound of 8 between 5.5 and 16.
   */
  function growthExponent(
    sizes: readonly [number, number, number],
    run: (size: number) => number,
    { runs = 3, floorMilliseconds = FLOOR_MILLISECONDS } = {},
  ): number {
    const fastest = sizes.map(() => Number.POSITIVE_INFINITY);
    for (let round = 0; round < runs; round += 1) {
      sizes.forEach((size, index) => {
        fastest[index] = Math.min(fastest[index] ?? Number.POSITIVE_INFINITY, run(size));
      });
    }
    const xs = sizes.map((size) => Math.log(size));
    const ys = fastest.map((time) => Math.log(Math.max(time, floorMilliseconds)));
    const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
    const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
    const covariance = xs.reduce(
      (sum, x, index) => sum + (x - meanX) * ((ys[index] ?? meanY) - meanY),
      0,
    );
    const variance = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
    return covariance / variance;
  }

  it("measures a linear function as growing like its input and a quadratic one like its square", () => {
    // The measure is checked against known functions, so a defect in it cannot pass every case
    // below. The smallest run takes about 15 ms, well over the floor, so a busy spell cannot sink it
    // into noise; the bound is what has to separate the two.
    const spin = (count: number): number => {
      const started = performance.now();
      let sink = 0;
      for (let step = 0; step < count; step += 1) sink += Math.sqrt(step);
      if (sink < 0) throw new Error("unreachable: keeps the loop from being removed");
      return performance.now() - started;
    };
    const sizes = [100, 400, 1600] as const;
    const linear = growthExponent(sizes, (size) => spin(size * 25_000), { runs: 7 });
    const quadratic = growthExponent(sizes, (size) => spin(size * size * 250), { runs: 3 });
    expect(linear).toBeLessThan(GROWTH_EXPONENT_BOUND);
    expect(quadratic).toBeGreaterThan(GROWTH_EXPONENT_BOUND);
  }, 120_000);

  function timed(input: string): number {
    const started = performance.now();
    sanitiseSvgLogoWithLimits(input, undefined, limits);
    return performance.now() - started;
  }

  // Each shape is read to its end, accepted or refused only there, and is as large as it takes for
  // the smallest of its three sizes to run for about 10 ms or more on a laptop: a shape the reader
  // gets through in a fraction of that is made larger rather than timed in the noise.
  it.each<readonly [string, (fill: Fill, bytes: number) => string, number, string]>([
    ["ampersands in a comment", (fill) => root(`<!--${fill("&")}-->`), 32, "accepted"],
    [
      "character references in an attribute",
      (fill) => root(`<g fill="${fill("&#x41;")}"/>`),
      8,
      "accepted",
    ],
    ["character references", (fill) => root(`<title>${fill("&#x41;")}</title>`), 8, "accepted"],
    ["an unclosed comment", (fill) => root(`<!--${fill("- ")}`), 32, "invalid-comment"],
    ["comments", (fill) => root(fill("<!-- x -->")), 32, "accepted"],
    [
      "a title split by comments",
      (fill) => root(`<title>${fill("a<!---->")}</title>`),
      8,
      "accepted",
    ],
    ["an unclosed CDATA section", (fill) => root(`<title><![CDATA[${fill("]")}`), 16, "malformed"],
    [
      "less-than signs in a CDATA section",
      (fill) => root(`<title><![CDATA[${fill("<")}]]></title>`),
      1,
      "accepted",
    ],
    ["empty elements", (fill) => root(fill('<path d="M0 0"/>')), 1, "accepted"],
    [
      "attributes",
      (_, bytes) =>
        root(
          `<g ${Array.from({ length: bytes / 10 }, (_unused, index) => `a${String(index)}="1"`).join(" ")}/>`,
        ),
      4,
      "accepted",
    ],
    [
      "nesting at the depth limit, over and over",
      (fill) => root(fill("<g>".repeat(30) + "</g>".repeat(30))),
      1,
      "accepted",
    ],
    ["unclosed tags", (fill) => root(fill("<g>")), 4, "mismatched-tag"],
    ["one long path", (fill) => root(`<path d="M0 0${fill(" 1.5-2.5e1")}"/>`), 1, "accepted"],
    ["one long path of bare signs", (fill) => root(`<path d="M0 0${fill("-")}"/>`), 8, "accepted"],
    ["one long attribute of digits", (fill) => root(`<rect width="${fill("9")}"/>`), 8, "accepted"],
    ["an unclosed attribute", (fill) => root(`<g fill="${fill("a")}`), 32, "malformed"],
    ["a long style attribute", (fill) => root(`<g style="${fill("fill:red;")}"/>`), 4, "accepted"],
    [
      "a style of one url of white space",
      (fill) => root(`<g style="url(${fill(" ")}#("/>`),
      8,
      "accepted",
    ],
    ["a long transform", (fill) => root(`<g transform="${fill("scale(1)")}"/>`), 8, "accepted"],
    ["a long point list", (fill) => root(`<polygon points="${fill("1,2 ")}"/>`), 1, "accepted"],
    [
      "many uses of one group",
      (fill) => root(`<g id="g"/>${fill('<use href="#g"/>')}`),
      1,
      "accepted",
    ],
    [
      "many uses of one masked path",
      (fill) =>
        root(
          `<mask id="m"/><path id="p" d="M0 0 1 1" mask="url(#m)" stroke-dasharray="1"/>${fill('<use href="#p"/>')}`,
        ),
      1,
      "overdraw-too-large",
    ],
    [
      "one long path of arcs, dashed",
      (fill) => root(`<path d="M0 0${fill("A1 2 3 0 1 4 5")}" stroke-dasharray="0.1"/>`),
      1,
      "overdraw-too-large",
    ],
    ["greater-than signs in text", (fill) => root(fill(">")), 8, "accepted"],
    ["one long element name", (fill) => root(`<${fill("a")}/>`), 32, "accepted"],
  ])(
    "reads %s in linear time: sixteen times the input takes far less than quadratic time",
    (_label, build, scale, outcome) => {
      const at = (bytes: number): string =>
        build((unit) => unit.repeat(Math.ceil(bytes / unit.length)), bytes);
      const smallest = (QUARTER_MEGABYTE * scale) / 4;
      const sizes = [smallest, smallest * 4, smallest * 16] as const;
      const inputs = new Map(sizes.map((bytes) => [bytes, at(bytes)]));
      const result = sanitiseSvgLogoWithLimits(inputs.get(sizes[2]) ?? "", undefined, limits);
      expect(result.ok ? "accepted" : result.errors[0]?.code).toBe(outcome);
      // An exponent, not a time, so a slow machine cannot fail it. The floor keeps a run too short
      // to time from making the fit noise. No retries: the wide span is what tolerates a busy spell.
      expect(growthExponent(sizes, (bytes) => timed(inputs.get(bytes) ?? ""))).toBeLessThan(
        GROWTH_EXPONENT_BOUND,
      );
    },
    300_000,
  );
});
