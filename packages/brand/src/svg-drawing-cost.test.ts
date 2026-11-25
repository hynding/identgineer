import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { dashPeriod, measurePathData, SVG_DRAWING_WEIGHTS } from "./svg-drawing-cost.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoAccepted, SvgLogoErrorCode } from "./svg-logo-result.ts";
import { SVG_GRAMMARS } from "./svg-values.ts";

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function svg(body: string, viewBox = "0 0 10 10"): string {
  return `<svg ${NS} viewBox="${viewBox}">${body}</svg>`;
}

function accepted(input: string): SvgLogoAccepted {
  const result = sanitiseSvgLogo(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
}

function cost(body: string, viewBox?: string): number {
  return accepted(svg(body, viewBox)).drawingCost;
}

/** A view box a hundred units square, as some tests below are drawn in. */
const BOX = "0 0 100 100";

/** The perimeter of an ellipse, added up over a million pieces. */
function ellipsePerimeter(rx: number, ry: number): number {
  let length = 0;
  const pieces = 1_000_000;
  for (let index = 1; index <= pieces; index += 1) {
    const [from, to] = [((index - 1) / pieces) * 2 * Math.PI, (index / pieces) * 2 * Math.PI];
    length += Math.hypot(
      rx * (Math.cos(to) - Math.cos(from)),
      ry * (Math.sin(to) - Math.sin(from)),
    );
  }
  return length;
}

function refusal(input: string): SvgLogoErrorCode | undefined {
  const result = sanitiseSvgLogo(input);
  return result.ok ? undefined : result.errors[0]?.code;
}

/** A zigzag path of about `characters` characters of `L` segments across a 1000 by 1000 box. */
function zigzag(characters: number): string {
  let data = "M0 0";
  for (let index = 0; data.length < characters; index += 1) {
    data += `L${String((index * 37) % 1000)} ${String((index * 91) % 1000)}`;
  }
  return data;
}

/** `g1` holds ten uses of `#p`, `g2` ten of `g1`, `g3` ten of `g2`: a thousand copies of `p`. */
function thousandCopies(definition: string, roots: number): string {
  const level = (name: string, target: string): string =>
    `<g id="${name}">${`<use href="#${target}"/>`.repeat(10)}</g>`;
  return svg(
    `<defs>${definition}${level("g1", "p")}${level("g2", "g1")}${level("g3", "g2")}</defs>` +
      '<use href="#g3"/>'.repeat(roots),
    "0 0 1000 1000",
  );
}

/**
 * `depth` masks, each but the first masking its own rectangle with the one before, over squares of
 * `size` in a 1000 by 1000 view box.
 */
function nestedMasks(depth: number, uses: number, size = 1000): string {
  const square = `width="${String(size)}" height="${String(size)}"`;
  let body = "<defs>";
  for (let index = 0; index < depth; index += 1) {
    const inner = index === 0 ? "" : ` mask="url(#m${String(index - 1)})"`;
    body += `<mask id="m${String(index)}"><rect ${square} fill="#fff"${inner}/></mask>`;
  }
  body += `<rect id="r" ${square} mask="url(#m${String(depth - 1)})"/></defs>`;
  return svg(body + '<use href="#r"/>'.repeat(uses), "0 0 1000 1000");
}

describe("measurePathData", () => {
  it.each([
    ["M0 0", 0, 0],
    ["M0 0L10 0", 1, 10],
    ["M0 0 10 0 10 10", 2, 20],
    ["M0 0H10V10Z", 3, 20 + Math.hypot(10, 10)],
    ["m1 1l10 0v10h-10z", 4, 40],
    ["M0 0ZM5 5L6 5", 2, 1],
    // A curve is no longer than the lines between its control points.
    ["M0 0C0 10 10 10 10 0", 10, 30],
    ["M0 0C0 10 10 10 10 0S20 -10 20 0", 20, 60],
    ["M0 0Q5 10 10 0T20 0", 12, 4 * Math.hypot(5, 10)],
    ["M0 0c0 10 10 10 10 0s10 -10 10 0", 20, 60],
    // An arc is no longer than its whole ellipse, its radii scaled up as SVG scales them.
    ["M0 0A5 5 0 0 1 10 0", 14, 2 * Math.PI * 5],
    ["M0 0A1 1 0 0 1 10 0", 14, 2 * Math.PI * 5],
    ["M0 0A10 1 90 0 1 0 10", 14, 2 * Math.PI * 10],
    ["M0 0A1000 0.001 0 0 1 0 10", 14, 2 * Math.PI * 5_000_000],
    ["M0 0A0 5 0 0 1 10 0", 14, 10],
  ])("weighs %s at %d and bounds its length by %d, within a hair", (data, weight, length) => {
    const measured = measurePathData(data);
    expect(measured.weight).toBe(weight);
    // The bound covers every reading Chromium can make of the numbers, a hair over the exact one.
    expect(measured.length).toBeGreaterThanOrEqual(length);
    expect(measured.length).toBeLessThanOrEqual(length * (1 + 2e-3) + 1e-3);
  });
});

/** Path data as the sanitiser keeps it, read from a spelling. */
function kept(written: string): string {
  const value = SVG_GRAMMARS.d?.(written, SVG_LOGO_LIMITS);
  if (value === undefined || !("text" in value)) throw new Error(`${written} is not kept`);
  return value.text;
}

// Chromium reads each number in single precision, by a reader whose result need not be the nearest
// single-precision number, so two spellings of one number, or the angle of an arc, can come out a
// hair apart. Along a radius far smaller than that hair, SVG scales the radii up until the ellipse
// reaches the end point, by as much as a hair over the radius. Each length and box below is what
// Chromium 153 measured (`getTotalLength`, `getBBox`) for the path as written.
describe("an arc, bounded over every reading Chromium can make of its numbers", () => {
  it.each([
    ["M0.3 1.1A1e-12 10 .9e6 0 0 0.3 3.1", 21_816_612_864, [-3_590_867, 1.1, 0.5, 5_992_382_977.1]],
    [
      "M123.45 2.3A1e-12 3 0 1 1 .12345e3 1.1",
      36_478_076,
      [123.45, -11_444_091, 123.45, 4_740_299],
    ],
    [
      "M12.7 0.1A1e-12 1 180 1 1 .127e2 2.1",
      1_430_510.5,
      [12.7, -476_836.0625, 12.7, 197_513.9375],
    ],
    [
      "M9.9 0.05A1e-12 1 30 0 1 99e-1 00.05",
      1_316_289.25,
      [9.9, -357_627.8125, 206_486.47, 0.09375],
    ],
    ["M9.9 33.3l0.2 0A5 1e-8 .9e6 0 1 0.05 033.3", 5_481_423, [0.05, 33.3, 1_505_591.3, 935.51]],
    [
      "M12.7 33.3l0.6 0A1 1e-8 .9e6 1 0 0.1 .333e2",
      1_439_897.25,
      [-395_490.69, -203.7, 13.34375, 33.3],
    ],
    ["M0.3 0A1e-12 1 0 0 0 30e-2 2", 17_694.76, [0.3, -6171.2, 0.3, 2]],
  ] as const)(
    "bounds %s by Chromium's length and box",
    (written, length, [minX, minY, maxX, maxY]) => {
      const measured = measurePathData(kept(written));
      expect(measured.length).toBeGreaterThanOrEqual(length);
      expect(measured.box.minX).toBeLessThanOrEqual(minX);
      expect(measured.box.minY).toBeLessThanOrEqual(minY);
      expect(measured.box.maxX).toBeGreaterThanOrEqual(maxX);
      expect(measured.box.maxY).toBeGreaterThanOrEqual(maxY);
    },
  );

  // Where the radii are far larger than any hair Chromium's reading can move the ends by, as in
  // every arc an editor writes, the bound is the whole ellipse, a hair over.
  it.each([
    ["m 2.6458333,5.2916667 a 0.26458333,0.13229167 0 0 1 0.52916667,0", 2 * Math.PI * 0.26458333],
    ["M10 50A40 40 0 1 0 10.0000004 50", 2 * Math.PI * 40],
    ["M0 0A0.001 0.001 0 0 1 0.002 0", 2 * Math.PI * 0.001],
  ])("bounds %s by its whole ellipse, a hair over", (written, length) => {
    const measured = measurePathData(kept(written));
    expect(measured.length).toBeGreaterThanOrEqual(length);
    expect(measured.length).toBeLessThanOrEqual(length * 1.01);
  });

  // Coincident points Chromium may read apart: each segment's length is bounded over the readings
  // too, so a dash period far below the hair cannot hide dashes behind a length of nothing.
  it("bounds segments of no length by the hair Chromium may read them apart by", () => {
    expect(measurePathData(kept(`M0.3 0${"L30e-2 0L0.3 0".repeat(10)}`)).length).toBeGreaterThan(
      20 * 2 ** -24 * 0.3,
    );
  });
});

describe("dashPeriod", () => {
  it.each([
    ["none", 0],
    ["0 0", 0],
    ["1", 2],
    ["1 2", 3],
    ["1 2 3", 12],
    ["0.5 0.5", 1],
    ["1mm 1mm", (2 * 96) / 25.4],
    ["1in", 192],
  ])("reads %s as a period of %d user units, at its shortest reading", (value, period) => {
    // The shortest reading Chromium can make of the lengths, a hair under the exact period.
    expect(dashPeriod(value)).toBeLessThanOrEqual(period);
    expect(dashPeriod(value)).toBeGreaterThanOrEqual(period * (1 - 1e-4));
  });

  // A length far below the smallest normal single-precision number is read by Chromium a step of
  // the smallest one off, below it as often as above: the period counted is the shortest reading.
  it("reads a period far below the single-precision range at its shortest reading", () => {
    const value = `0.${"0".repeat(43)}1`;
    expect(dashPeriod(value)).toBeGreaterThan(0);
    expect(dashPeriod(value)).toBeLessThanOrEqual(2 * Math.fround(1e-44));
  });

  // A kept dash array holds only the units its grammar keeps (px written as none); anything else
  // reaching the cost model is a defect upstream, and must not cost nothing.
  it.each(["1em", "1ex", "1rem", "1vw", "1%", "1px", "1q", "1 2em", "1zz", "x", ""])(
    "refuses %j, which no grammar keeps in a dash array",
    (value) => {
      expect(() => dashPeriod(value)).toThrow(/dash/);
    },
  );
});

describe("the drawing cost of a logo", () => {
  it("weighs every kind of shape by its geometry, on top of a fixed cost to draw it", () => {
    expect(SVG_DRAWING_WEIGHTS).toEqual({
      line: 1,
      quadratic: 6,
      cubic: 10,
      arc: 14,
      shape: 32,
      element: 1,
      layer: 50,
      mask: 200,
      dash: 1,
      tiledDash: { butt: 4, square: 5, round: 9, wideRound: 24 },
    });
    expect(cost("")).toBe(1);
    expect(cost('<rect width="1" height="1"/>')).toBe(37);
    expect(cost('<rect width="2" height="2" rx="1"/>')).toBe(77);
    expect(cost('<circle r="1"/>')).toBe(73);
    expect(cost('<ellipse rx="1" ry="2"/>')).toBe(73);
    expect(cost('<line x2="1"/>')).toBe(34);
    expect(cost('<polyline points="0,0 1,1 2,0"/>')).toBe(35);
    expect(cost('<polygon points="0,0 1,1 2,0"/>')).toBe(36);
    expect(cost('<path d="M0 0C1 1 2 2 3 3"/>')).toBe(43);
    expect(cost('<g><rect width="1" height="1"/><rect width="1" height="1"/></g>')).toBe(74);
    expect(cost("<title>a</title><desc>b</desc>")).toBe(3);
  });

  it("counts what a definition draws once for each use of it, and nothing for the definition", () => {
    expect(cost('<defs><rect id="r" width="1" height="1"/></defs>')).toBe(1);
    expect(
      cost(`<defs><rect id="r" width="1" height="1"/></defs>${'<use href="#r"/>'.repeat(3)}`),
    ).toBe(112);
    expect(cost('<linearGradient id="g"/><rect width="1" height="1" fill="url(#g)"/>')).toBe(37);
  });

  it("charges a mask or a clip path every time it is applied, with what it holds", () => {
    expect(
      cost(
        '<mask id="m"><rect width="1" height="1"/></mask><rect width="1" height="1" mask="url(#m)"/>',
      ),
    ).toBe(274);
    expect(
      cost(
        '<clipPath id="c"><rect width="1" height="1"/></clipPath><rect width="1" height="1" clip-path="url(#c)"/>',
      ),
    ).toBe(274);
    // A mask inside a mask is applied each time the outer one is.
    expect(
      cost(
        '<defs><mask id="m0"><rect width="1" height="1"/></mask>' +
          '<mask id="m1"><rect width="1" height="1" mask="url(#m0)"/></mask>' +
          '<rect id="r" width="1" height="1" mask="url(#m1)"/></defs><use href="#r"/>',
      ),
    ).toBe(1 + 1 + (36 + 200 + (1 + 36 + 200 + (1 + 36))));
  });

  it("charges a layer for group opacity", () => {
    expect(cost('<g opacity="0.5"><rect width="1" height="1"/></g>')).toBe(88);
    expect(cost('<g opacity="1"><rect width="1" height="1"/></g>')).toBe(38);
  });

  it("counts the dashes of every shape a dash array could reach", () => {
    // Each subpath starts the pattern afresh, so up to one more repeat each; and a length a whole
    // number of periods long is, as Chromium may read the numbers, a hair longer than that, so a
    // repeat more is begun: 51 of a period of 2 along 100, and one more for the subpath.
    expect(cost('<path d="M0 0H100" stroke-dasharray="1"/>')).toBe(1 + 33 + 52);
    expect(
      cost('<g stroke-dasharray="10"><path d="M0 0H100"/><rect width="10" height="10"/></g>'),
    ).toBe(82);
    // A shape no dash array reaches is solid, however finely another shape is dashed.
    expect(cost('<path d="M0 0H100"/><path d="M0 0H1" stroke-dasharray="1 1"/>')).toBe(
      1 + 33 + (33 + 2),
    );
    expect(cost('<rect width="100%" height="100%" stroke-dasharray="1"/>')).toBe(59);
    expect(cost('<path d="M0 0H100" stroke-dasharray="0 0"/>')).toBe(34);
    // Unstroked, no dash is worked out again for the tiles of an image (see below): one a dash.
    expect(cost('<path d="M0 0H100M0 10H100" stroke-dasharray="1"/>')).toBe(1 + 34 + 103);
  });

  it("charges a dash one in the shape itself, whatever the shape", () => {
    // Unstroked, nothing is dashed again for the tiles of an image: each dash costs one, along one
    // horizontal or vertical line, a rectangle, or anything else.
    expect(cost('<line x2="100" stroke-dasharray="1"/>')).toBe(1 + 33 + 52);
    expect(cost('<path d="m5 0h100" stroke-dasharray="1"/>')).toBe(1 + 33 + 52);
    expect(cost('<rect width="10" height="10" stroke-dasharray="1"/>')).toBe(1 + 36 + 22);
    expect(cost('<path d="M0 0H100V100h-100v-100" stroke-dasharray="1"/>')).toBe(1 + 36 + 202);
    expect(cost('<path d="M0 0H100V100" stroke-dasharray="1"/>')).toBe(1 + 34 + 102);
    expect(cost('<line y1="5" y2="5.0" x2="100" stroke-dasharray="1"/>')).toBe(1 + 33 + 52);
    expect(cost('<line x2="60" y2="80" stroke-dasharray="1"/>')).toBe(1 + 33 + 52);
    expect(cost('<rect width="10" height="10" rx="1" stroke-dasharray="1"/>')).toBe(1 + 76 + 22);
    expect(cost('<circle r="10" stroke-dasharray="1"/>')).toBe(1 + 72 + 33);
    expect(cost('<path d="M0 0C30 0 70 0 100 0" stroke-dasharray="1"/>')).toBe(1 + 42 + 52);
  });

  it("charges each dash of a stroke again for the share of the tiles of a large image its box can touch, by its caps, but along one horizontal or vertical line or round a rectangle, which Chromium culls to the tile", () => {
    const stroked = (shape: string, paint = ""): number =>
      cost(shape.replace("/>", ` stroke="#000" stroke-dasharray="1"${paint}/>`), BOX);
    // Culled to the tile: a line whose ends share a coordinate written the same, a path of one
    // move and one H or V segment, a rectangle without rounded corners, stroked or not.
    expect(stroked('<line x2="100"/>')).toBe(1 + 33 + 52);
    expect(stroked('<line x1="5" x2="5" y2="100"/>')).toBe(1 + 33 + 52);
    expect(stroked('<path d="M5 0V100"/>')).toBe(1 + 33 + 52);
    expect(stroked('<rect width="10" height="10"/>')).toBe(1 + 36 + 22);
    expect(stroked('<rect width="10" height="10" rx="0"/>')).toBe(1 + 36 + 22);
    expect(stroked('<rect width="10" height="10" ry="0"/>')).toBe(1 + 36 + 22);
    // Anything else, even where its numbers come out horizontal, is worked out again for every
    // tile its box touches (the stroke's reach included: half its width, four times over at a
    // miter join), counted on a grid of eight by eight: across the whole image, a share of 1. A
    // diagonal of 72 dashes costs four more a dash butt, five square and nine round.
    expect(stroked('<line x2="100" y2="100"/>')).toBe(1 + 33 + 72 + 72 * 4);
    expect(stroked('<line x2="100" y2="100"/>', ' stroke-linecap="butt"')).toBe(
      1 + 33 + 72 + 72 * 4,
    );
    expect(stroked('<line x2="100" y2="100"/>', ' stroke-linecap="square"')).toBe(
      1 + 33 + 72 + 72 * 5,
    );
    expect(stroked('<line x2="100" y2="100"/>', ' stroke-linecap="round"')).toBe(
      1 + 33 + 72 + 72 * 9,
    );
    // A coordinate written two ways, a line segment, a path of two H or V segments: 52 or 102
    // dashes in a box as wide as the image and four high, so eight columns and two rows (one more
    // where it straddles two), a quarter of the tiles.
    expect(stroked('<line y1="5" y2="5.0" x2="100"/>')).toBe(1 + 33 + 52 + (52 * 4) / 4);
    expect(stroked('<path d="M0 5L100 5"/>')).toBe(1 + 33 + 52 + (52 * 4) / 4);
    expect(stroked('<path d="M0 5H50H100"/>')).toBe(1 + 34 + 52 + (52 * 4) / 4);
    expect(stroked('<path d="M0 5H100H0"/>')).toBe(1 + 34 + 102 + (102 * 4) / 4);
    expect(stroked('<polyline points="0,0 100,0"/>')).toBe(1 + 33 + 52 + (52 * 4) / 4);
    expect(stroked('<path d="M0 0C30 0 70 0 100 0"/>')).toBe(1 + 42 + 52 + (52 * 4) / 4);
    // Paths of H and V segments, open, closed or in steps, across the whole image.
    expect(stroked('<path d="M0 0H100V100"/>')).toBe(1 + 34 + 102 + 102 * 4);
    expect(stroked('<path d="M0 0H50V50H100V100"/>')).toBe(1 + 36 + 102 + 102 * 4);
    expect(stroked('<path d="M0 0H100V100H0Z"/>')).toBe(1 + 36 + 202 + 202 * 4);
    // A rectangle with rounded corners, 14 across with its reach: three columns and three rows.
    expect(stroked('<rect width="10" height="10" rx="1"/>')).toBe(
      Math.ceil(1 + 76 + 22 + (22 * 4 * 9) / 64),
    );
    // A small shape in a corner touches few tiles: 9 dashes along a diagonal 14 across with its
    // reach, three columns and three rows, 9 of 64; scaled up ten times, all of them.
    expect(stroked('<line x2="10" y2="10"/>')).toBe(Math.ceil(1 + 33 + 9 + (9 * 4 * 9) / 64));
    expect(stroked('<line x2="10" y2="10" transform="scale(10)"/>')).toBe(1 + 33 + 9 + 9 * 4);
    // A curve: a circle of 143 dashes across the image.
    expect(stroked('<circle cx="50" cy="50" r="45" fill="none"/>')).toBe(1 + 72 + 143 + 143 * 4);
    // Unstroked, or stroked with nothing, nothing is dashed again.
    expect(cost('<line x2="100" y2="100" stroke-dasharray="1"/>', BOX)).toBe(1 + 33 + 72);
    expect(stroked('<line x2="100" y2="100"/>', ' stroke-width="0"')).toBe(1 + 33 + 72);
    expect(cost('<line x2="100" y2="100" stroke="none" stroke-dasharray="1"/>', BOX)).toBe(
      1 + 33 + 72,
    );
  });

  it("charges the tiles each instance of a dashed stroke touches, with its own transform and the caps and dash array it inherits", () => {
    const small = '<path id="p" d="M0 0L10 10" stroke="#000"';
    const smallTiles = (9 * 4 * 9) / 64;
    // Drawn twice, once scaled up ten times: each instance its own share.
    expect(
      cost(
        `<defs>${small} stroke-dasharray="1"/></defs><use href="#p"/><use href="#p" transform="scale(10)"/>`,
        BOX,
      ),
    ).toBe(Math.ceil(1 + 2 * (1 + 33 + 9) + smallTiles + 9 * 4));
    // The dash array and the caps from the use that draws it, or from a group around that use.
    expect(cost(`<defs>${small}/></defs><use href="#p" stroke-dasharray="1"/>`, BOX)).toBe(
      Math.ceil(1 + 1 + 33 + 9 + smallTiles),
    );
    expect(
      cost(
        `<defs>${small} stroke-dasharray="1"/></defs><g stroke-linecap="round"><use href="#p" transform="scale(10)"/></g>`,
        BOX,
      ),
    ).toBe(1 + 1 + 1 + 33 + 9 + 9 * 9);
    // And in a mask's content, from the mask's own ancestors.
    expect(
      cost(
        `<g stroke-dasharray="1"><mask id="m"><path d="M0 0L100 100" stroke="#fff"/></mask></g><rect width="1" height="1" mask="url(#m)"/>`,
        BOX,
      ),
    ).toBe(1 + 1 + 1 + 33 + 72 + (36 + 200) + 72 * 4);
  });

  it("charges a round-capped dash more once its stroke, as drawn, is wider than a tile of eight by eight", () => {
    const circle = (paint: string, wrap = (shape: string): string => shape): number =>
      cost(
        wrap(
          `<circle cx="50" cy="50" r="45" fill="none" stroke="#000" stroke-dasharray="1"${paint}/>`,
        ),
        BOX,
      );
    const round = ' stroke-linecap="round"';
    // 143 dashes across the image: a tile is an eighth of its side, 12.5 here.
    expect(circle(` stroke-width="12.5"${round}`)).toBe(1 + 72 + 143 + 143 * 9);
    expect(circle(` stroke-width="12.6"${round}`)).toBe(1 + 72 + 143 + 143 * 24);
    expect(circle(` stroke-width="100"${round}`)).toBe(1 + 72 + 143 + 143 * 24);
    // Butt and square caps cost the same however wide.
    expect(circle(' stroke-width="100" stroke-linecap="butt"')).toBe(1 + 72 + 143 + 143 * 4);
    expect(circle(' stroke-width="100" stroke-linecap="square"')).toBe(1 + 72 + 143 + 143 * 5);
    // The width as drawn: scaled by the shape's transform, by the larger of its stretches, or
    // inherited from a group.
    expect(circle(` stroke-width="7" transform="scale(2)"${round}`)).toBe(1 + 72 + 143 + 143 * 24);
    expect(circle(` stroke-width="7" transform="scale(2 1.5)"${round}`)).toBe(
      1 + 72 + 143 + 143 * 24,
    );
    expect(circle(` stroke-width="20" transform="scale(0.5)"${round}`)).toBe(
      1 + 72 + 143 + 143 * 9,
    );
    expect(circle(round, (shape) => `<g stroke-width="20">${shape}</g>`)).toBe(
      1 + 1 + 72 + 143 + 143 * 24,
    );
  });

  it("charges each instance of a round-capped dash by the width it is drawn at", () => {
    const definition =
      '<defs><circle id="p" cx="50" cy="50" r="45" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-dasharray="1"/></defs>';
    // Through a use scaled up twice, and one not scaled; or with the width from the use.
    expect(cost(`${definition}<use href="#p" transform="scale(2)"/><use href="#p"/>`, BOX)).toBe(
      1 + 2 * (1 + 72 + 143) + 143 * 24 + 143 * 9,
    );
    expect(
      cost(
        '<defs><circle id="p" cx="50" cy="50" r="45" fill="none" stroke="#000" stroke-linecap="round" stroke-dasharray="1"/></defs><use href="#p" stroke-width="13"/>',
        BOX,
      ),
    ).toBe(1 + 1 + 72 + 143 + 143 * 24);
  });

  it("bounds the length of an ellipse by pi times the root of twice the sum of its radii squared, never shorter than it is", () => {
    // 45 by 16: no longer than 212.2, so 107 dashes of a period of 2 and one more for the subpath;
    // it is about 208.9 round. A circle's is its circumference.
    expect(cost('<ellipse rx="45" ry="16" stroke-dasharray="1"/>', BOX)).toBe(1 + 72 + 108);
    expect(cost('<circle r="45" stroke-dasharray="1"/>', BOX)).toBe(1 + 72 + 143);
    for (const ry of [45, 40, 30, 16, 5, 1, 0.01]) {
      const dashes = cost(`<ellipse rx="45" ry="${String(ry)}" stroke-dasharray="1"/>`, BOX) - 73;
      const perimeter = ellipsePerimeter(45, ry);
      expect(dashes, String(ry)).toBeGreaterThanOrEqual(Math.ceil(perimeter / 2) + 1);
      // The bound is at most a little over a tenth longer, for the flattest ellipse.
      expect(dashes, String(ry)).toBeLessThanOrEqual(Math.ceil((perimeter * 1.12) / 2) + 1);
    }
  });

  it("counts every dash in each repeat of a dash array, an odd one repeated twice", () => {
    // 64 lengths of 1: a period of 64 holding 32 dashes, (2 + 1) x 32 along 100.
    const sixtyFour = Array.from({ length: 64 }, () => "1").join(" ");
    expect(cost(`<path d="M0 0H100" stroke-dasharray="${sixtyFour}"/>`)).toBe(1 + 33 + 96);
    // 1 2 3: a period of 12 holding 3 dashes, (9 + 1) x 3.
    expect(cost('<path d="M0 0H100" stroke-dasharray="1 2 3"/>')).toBe(1 + 33 + 30);
    // A shape is counted at its own dash array; one that inherits a dash array, at the shortest
    // period and the most dashes in a repeat anywhere in the logo: a period of 20 holding 32
    // dashes here, five of them along 100 and a hair more as read, so six begun, and one more for
    // the subpath.
    const long = Array.from({ length: 64 }, () => "5").join(" ");
    expect(
      cost(
        `<path d="M0 0H100" stroke-dasharray="10"/><path d="M0 0H1" stroke-dasharray="${long}"/>`,
      ),
    ).toBe(1 + (33 + 7) + (33 + 2 * 32));
    expect(
      cost(
        `<g stroke-dasharray="10"><path d="M0 0H100"/></g><path d="M0 0H1" stroke-dasharray="${long}"/>`,
      ),
    ).toBe(1 + 1 + (33 + 7 * 32) + (33 + 2 * 32));
  });

  it("counts in full the dashes of a shape that inherits a dash array, from an ancestor or from a use that draws it", () => {
    const line = '<path d="M0 0H100" stroke-dasharray="1"/>';
    // 52 dashes along the line, as it costs dashed itself.
    expect(cost(line)).toBe(1 + 33 + 52);
    expect(cost('<g stroke-dasharray="1"><g><path d="M0 0H100"/></g></g>')).toBe(cost(line) + 2);
    // Drawn by a use under a dashed group, by a dashed use, and by a dashed use of a group holding
    // a use of it: the instance inherits from the use, wherever the definition stands.
    const definition = '<defs><path id="p" d="M0 0H100"/><g id="q"><use href="#p"/></g></defs>';
    const solid = cost(`${definition}<g><use href="#p"/></g>`);
    expect(cost(`${definition}<g stroke-dasharray="1"><use href="#p"/></g>`)).toBe(solid + 52);
    expect(cost(`${definition}<use href="#p" stroke-dasharray="1"/><g/>`)).toBe(solid + 52);
    expect(cost(`${definition}<use href="#q" stroke-dasharray="1"/>`)).toBe(
      cost(`${definition}<use href="#q"/>`) + 52,
    );
    // Through a mask too, whose content inherits from the mask's ancestors.
    expect(
      cost(
        '<g stroke-dasharray="1"><mask id="m"><path d="M0 0H100"/></mask></g><rect width="1" height="1" mask="url(#m)"/>',
      ),
    ).toBe(
      cost(
        '<g><mask id="m"><path d="M0 0H100"/></mask></g><rect width="1" height="1" mask="url(#m)"/>',
      ) + 52,
    );
    // A shape's own dash array, even none, is what it is drawn with.
    expect(cost('<g stroke-dasharray="1"><path d="M0 0H100" stroke-dasharray="none"/></g>')).toBe(
      1 + 1 + 33,
    );
  });

  it("drops what would make the dash count depend on the page: em and ex lengths, percentage dashes, non-scaling strokes", () => {
    const { removed } = accepted(
      svg(
        '<rect width="2em" height="1ex"/><path d="M0 0H1" stroke-dasharray="1%" vector-effect="non-scaling-stroke"/>',
      ),
    );
    expect(removed.map(({ attribute, reason }) => [attribute, reason])).toEqual([
      ["width", "invalid-value"],
      ["height", "invalid-value"],
      ["stroke-dasharray", "invalid-value"],
      ["vector-effect", "unsupported-attribute"],
    ]);
  });
});

describe("the drawing cost limit", () => {
  it.each([
    [
      "a filled 119 KB path drawn a thousand times",
      thousandCopies(`<path id="p" d="${zigzag(119_000)}" fill="#000"/>`, 1),
    ],
    [
      "a dashed, stroked 119 KB path drawn seven thousand times",
      thousandCopies(
        `<path id="p" d="${zigzag(119_000)}" fill="none" stroke="#000" stroke-width="3" stroke-dasharray="0.5 0.5"/>`,
        7,
      ),
    ],
    [
      "a dash a millionth long along four long lines",
      svg(
        '<path d="M0 0L999999 999999L0 999999L999999 0" stroke="#000" stroke-dasharray="0.000001"/>',
        "0 0 999999 999999",
      ),
    ],
    [
      "the reviewer's hairline path with a dash array of 64 lengths, drawn fourteen times",
      readFileSync(
        new URL(
          "./__fixtures__/hostile-svg/dashes-of-64-lengths-on-a-hairline.svg",
          import.meta.url,
        ),
        "utf8",
      ),
    ],
    [
      "a path of 8,000 arcs drawn twenty times",
      svg(
        `<defs><path id="p" d="M0 0${"A9 9 0 0 1 1 1".repeat(8_000)}"/></defs>${'<use href="#p"/>'.repeat(20)}`,
      ),
    ],
  ])("refuses %s", (_label, input) => {
    expect(refusal(input)).toBe("drawing-too-costly");
  });

  it("refuses seven nested masks used 1,200 times for their depth", () => {
    expect(refusal(nestedMasks(7, 1_200))).toBe("masks-too-deep");
  });

  it("refuses a mask applied 1,200 times for the count", () => {
    expect(refusal(nestedMasks(1, 1_200))).toBe("too-many-masks");
  });

  it("accepts a logo at the cost limit and refuses one just over it", () => {
    // Each use draws itself and a path of a hundred lines: 1 + 32 + 100.
    const path = `<path id="p" d="M0 0${" 1 1".repeat(100)}"/>`;
    const uses = (count: number): string =>
      svg(`<defs>${path}</defs>${'<use href="#p"/>'.repeat(count)}`);
    const fits = Math.floor((SVG_LOGO_LIMITS.drawingCost - 1) / 133);
    expect(accepted(uses(fits)).drawingCost).toBe(1 + 133 * fits);
    expect(refusal(uses(fits + 1))).toBe("drawing-too-costly");
  });

  it("accepts masks nested to the depth limit and refuses one more", () => {
    expect(accepted(nestedMasks(SVG_LOGO_LIMITS.maskDepth, 1)).ok).toBe(true);
    expect(refusal(nestedMasks(SVG_LOGO_LIMITS.maskDepth + 1, 1))).toBe("masks-too-deep");
  });

  it("accepts masks applied up to the limit and refuses one more", () => {
    // Small ones, so what they paint stays well within the overdraw limit.
    expect(accepted(nestedMasks(1, SVG_LOGO_LIMITS.maskApplications, 10)).ok).toBe(true);
    expect(refusal(nestedMasks(1, SVG_LOGO_LIMITS.maskApplications + 1, 10))).toBe(
      "too-many-masks",
    );
  });
});
