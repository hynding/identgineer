import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import type { SvgLogoAccepted } from "./svg-logo-result.ts";
import { findSanitisedSvgProblems } from "./svg-output-check.ts";

const CORPUS = new URL("./__fixtures__/clean-svg/", import.meta.url);
const GOLDEN = new URL("./__golden__/clean-svg/", import.meta.url);
const FILES = readdirSync(fileURLToPath(CORPUS)).sort();

function sanitised(file: string): SvgLogoAccepted {
  const result = sanitiseSvgLogo(readFileSync(new URL(file, CORPUS), "utf8"));
  if (!result.ok) throw new Error(`${file}: ${JSON.stringify(result.errors)}`);
  return result;
}

// Read straight from the source text, independently of the sanitiser's parser.
const SHAPES = /<(?:[A-Za-z]+:)?(path|rect|circle|ellipse|line|polyline|polygon|use)[\s/>]/g;
const GEOMETRY = /\s(d|points)="([^"]*)"/g;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

function shapes(svg: string): string[] {
  return [...svg.matchAll(SHAPES)].map((match) => match[1] ?? "");
}

function geometry(svg: string): number[][] {
  return [...svg.matchAll(GEOMETRY)].map((match) =>
    [...(match[2] ?? "").matchAll(NUMBER)].map((number) => Number(number[0])),
  );
}

describe("the clean SVG corpus", () => {
  it("holds logos as common tools export them", () => {
    expect(FILES).toEqual([
      "figma-alpha-mask.svg",
      "figma-export.svg",
      "illustrator-clip-of-dots.svg",
      "illustrator-internal-css.svg",
      "illustrator-presentation-attributes.svg",
      "illustrator-svg11-doctype.svg",
      "illustrator-text-clip.svg",
      "inkscape-export.svg",
      "mask-and-use.svg",
      "simple-mark.svg",
      "sketch-export.svg",
    ]);
  });

  it.each(FILES)("sanitises %s byte for byte as the golden file", (file) => {
    expect(`${sanitised(file).svg}\n`).toBe(readFileSync(new URL(file, GOLDEN), "utf8"));
  });

  it.each(FILES)("keeps every shape of %s and its geometry to six decimals", (file) => {
    const input = readFileSync(new URL(file, CORPUS), "utf8");
    const { svg } = sanitised(file);
    expect(shapes(svg)).toEqual(shapes(input));
    const before = geometry(input);
    const after = geometry(svg);
    expect(after.map((numbers) => numbers.length)).toEqual(before.map((numbers) => numbers.length));
    after.forEach((numbers, index) => {
      numbers.forEach((number, position) => {
        expect(Math.abs(number - (before[index]?.[position] ?? Number.NaN))).toBeLessThanOrEqual(
          5e-7,
        );
      });
    });
  });

  it.each(FILES)("removes the editor noise from %s and keeps it valid", (file) => {
    const result = sanitised(file);
    expect(findSanitisedSvgProblems(result.svg)).toEqual([]);
    expect(result.svg).not.toMatch(
      /inkscape|sodipodi|sketch|rdf|<!--|xml:space|enable-background|Layer_1|SVGID/,
    );
    for (const removal of result.removed) {
      expect([
        "editor-metadata",
        "unsupported-attribute",
        "styling",
        "document-type",
        "rewritten",
      ]).toContain(removal.reason);
    }
    const again = sanitiseSvgLogo(result.svg);
    expect(again.ok && again.svg).toBe(result.svg);
  });

  it("keeps the colours of a style attribute and a gradient chain, as Inkscape writes them", () => {
    const { svg, width, height } = sanitised("inkscape-export.svg");
    expect(svg).toContain('<linearGradient id="logo-1" href="#logo-0"');
    expect(svg).toContain('fill="url(#logo-1)"');
    expect(svg).toContain('stop-color="#38bdf8" stop-opacity="0.85"');
    expect([width, height]).toEqual([241.889764, 120.944882]);
  });

  it("keeps the paint order Inkscape writes, which draws the stroke under the fill", () => {
    const { svg, removed } = sanitised("inkscape-export.svg");
    expect(svg).toContain('paint-order="stroke fill markers"');
    expect(removed.map(({ property }) => property)).not.toContain("paint-order");
  });

  it("keeps the alpha mask type Figma writes in a style attribute, so the mask does not fade the logo", () => {
    const result = sanitised("figma-alpha-mask.svg");
    expect(result.svg).toContain(
      '<mask id="logo-0" x="0" y="0" width="64" height="64" maskUnits="userSpaceOnUse" mask-type="alpha">',
    );
    expect(result.removed).toEqual([]);
  });

  it("skips the SVG 1.1 document type older Illustrator versions write, and says so", () => {
    const result = sanitised("illustrator-svg11-doctype.svg");
    expect(result.removed[0]).toEqual({
      element: "!DOCTYPE",
      reason: "document-type",
      line: 3,
      column: 1,
    });
    expect([result.width, result.height]).toEqual([120, 40]);
  });

  it("drops a stylesheet and its classes, so a logo coloured only by CSS loses its colours", () => {
    const result = sanitised("illustrator-internal-css.svg");
    expect(result.svg).not.toContain("fill=");
    expect(result.removed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ element: "style", reason: "styling" }),
        expect.objectContaining({ element: "rect", attribute: "class", reason: "styling" }),
      ]),
    );
  });
});
