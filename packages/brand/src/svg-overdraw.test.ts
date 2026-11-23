import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoAccepted, SvgLogoErrorCode } from "./svg-logo-result.ts";
import { SVG_OVERDRAW_WEIGHTS } from "./svg-overdraw.ts";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const W = SVG_OVERDRAW_WEIGHTS;

/** A 100 by 100 view box: one unit of overdraw is 10,000 square user units painted solid. */
function svg(body: string, viewBox = "0 0 100 100"): string {
  return `<svg ${NS} viewBox="${viewBox}">${body}</svg>`;
}

function payload(name: string): string {
  return readFileSync(new URL(`./__fixtures__/hostile-svg/${name}`, import.meta.url), "utf8");
}

function accepted(input: string): SvgLogoAccepted {
  const result = sanitiseSvgLogo(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
}

function overdraw(body: string, viewBox?: string): number {
  return accepted(svg(body, viewBox)).overdraw;
}

function refusal(input: string): SvgLogoErrorCode | undefined {
  const result = sanitiseSvgLogo(input);
  return result.ok ? undefined : result.errors[0]?.code;
}

// A 50 by 50 square: a quarter of the view box, and an outline of 200, twice the larger side.
const SQUARE = 'width="50" height="50"';
const QUARTER = 0.25;
const SQUARE_EDGES = 2;

/** Edges as long as `sides` sides of the image, filled or as coverage. */
function edges(sides: number): number {
  return sides * W.edge * (1 + (sides / W.edgesPerRow) ** 2);
}

/**
 * A stroke's outline runs along both sides of the path, with `ends` more for its joins and caps
 * (and each dash's), in sides of the image.
 */
function strokeEdges(sides: number, ends = 0): number {
  return edges(2 * sides + ends);
}

describe("the overdraw of a logo", () => {
  it("weighs paint, layers, masks, clip paths and edges as measured", () => {
    expect(SVG_OVERDRAW_WEIGHTS).toEqual({
      solid: 1,
      translucent: 4,
      gradient: { 2: 6, 4: 13, 8: 14, 16: 15, 32: 19, 64: 23 },
      translucentGradient: { 2: 14, 4: 19, 8: 19, 16: 21, 32: 22, 64: 26 },
      layer: 16,
      mask: 64,
      alphaMask: 32,
      clip: 1,
      edge: 0.03,
      edgesPerRow: 800,
    });
    expect(SVG_LOGO_LIMITS.overdraw).toBe(500);
  });

  it("is nothing for a logo that paints nothing", () => {
    expect(overdraw("")).toBe(0);
    expect(overdraw(`<rect ${SQUARE} fill="none"/>`)).toBe(0);
    expect(overdraw(`<defs><rect id="r" ${SQUARE}/></defs>`)).toBe(0);
    expect(overdraw(`<rect ${SQUARE} display="none"/>`)).toBe(0);
  });

  it("charges a solid fill its area, as a share of the square on the larger side, and its edges", () => {
    expect(overdraw(`<rect ${SQUARE}/>`)).toBeCloseTo(QUARTER * W.solid + edges(SQUARE_EDGES), 9);
    expect(overdraw(`<rect ${SQUARE} fill="#123456"/>`, "0 0 100 50")).toBeCloseTo(
      QUARTER * W.solid + edges(SQUARE_EDGES),
      9,
    );
    expect(overdraw('<circle r="50"/>')).toBeCloseTo((Math.PI / 4) * W.solid + edges(Math.PI), 9);
    expect(overdraw('<path d="M0 0H50V50H0Z"/>')).toBeCloseTo(
      QUARTER * W.solid + edges(SQUARE_EDGES),
      9,
    );
  });

  it("bounds a path by the boxes of its subpaths, control points included", () => {
    // Two 10 by 10 squares far apart cover 200 square units, not the 8,100 of their common box.
    expect(overdraw('<path d="M0 0h10v10h-10zM80 80h10v10h-10z"/>')).toBeCloseTo(
      0.02 * W.solid + edges(0.8),
      9,
    );
    // A curve stays inside the box of its control points: 50 by 50 here.
    expect(overdraw('<path d="M0 0C0 50 50 50 50 0Z"/>')).toBeCloseTo(
      QUARTER * W.solid + edges((50 + 50 + 50 + 50) * 0.01),
      9,
    );
  });

  it("charges an instance at most the whole image, however far it reaches", () => {
    // A rectangle is convex: no more of its outline than the image's perimeter can be seen.
    expect(overdraw('<rect x="-500" y="-500" width="5000" height="5000"/>')).toBeCloseTo(
      W.solid + edges(4),
      9,
    );
  });

  it("charges a view box a thousand times wider than tall, drawn to fit, by its larger side", () => {
    // Shown to fit (the only way a kept logo is shown) in any image, the view box spans the image's
    // width at most, so its larger side is the image's: the bar covers a thousandth of the square.
    const bar = '<rect width="1000" height="1"/>';
    expect(overdraw(bar, "0 0 1000 1")).toBeCloseTo(0.001 * W.solid + edges(2.002), 9);
    expect(
      accepted(`<svg ${NS} viewBox="0 0 1000 1" preserveAspectRatio="none">${bar}</svg>`).overdraw,
    ).toBeCloseTo(0.001 * W.solid + edges(2.002), 9);
  });

  it("bounds how much of each segment's edge can be seen by its kind", () => {
    const hairline = 'fill="none" stroke="#000" stroke-width="0.000001"';
    const edges = (data: string): number => overdraw(`<path d="${data}" ${hairline}/>`);
    // A straight segment shows at most the image's diagonal.
    expect(edges("M-1000 -1000L1000 1000")).toBeCloseTo(strokeEdges(Math.SQRT2), 5);
    // A quadratic curve or an arc is convex: at most the image's perimeter.
    expect(edges("M-1000 0Q50 5000 1000 0")).toBeCloseTo(strokeEdges(4), 5);
    expect(edges("M0 0A1000 1000 0 1 1 1 0")).toBeCloseTo(strokeEdges(4), 5);
    // A cubic bends at most twice: three convex pieces.
    expect(edges("M-1000 0C3000 5000 -3000 5000 1000 0")).toBeCloseTo(strokeEdges(12), 5);
    // Short of those, the outline's own length.
    expect(edges("M0 0Q50 50 100 0")).toBeCloseTo(strokeEdges(Math.SQRT2), 5);
  });

  it("carries the area through transforms, ancestors' and use's included", () => {
    expect(overdraw(`<rect ${SQUARE} transform="scale(2 0.5)"/>`)).toBeCloseTo(
      QUARTER * W.solid + edges(2 * SQUARE_EDGES),
      9,
    );
    // Rotation keeps the area; the outline is no longer.
    expect(overdraw(`<rect ${SQUARE} transform="rotate(45)"/>`)).toBeCloseTo(
      QUARTER * W.solid + edges(SQUARE_EDGES),
      9,
    );
    const defs = '<defs><rect id="a" width="10" height="10"/></defs>';
    expect(
      overdraw(
        `${defs}<g transform="scale(2)"><use href="#a" transform="scale(2)"/><use href="#a" x="20"/></g>`,
      ),
    ).toBeCloseTo((0.16 + 0.04) * W.solid + edges(1.6) + edges(0.8), 9);
    // A use of a use is drawn as often as it is reached.
    expect(
      overdraw(
        `${defs}<g id="b"><use href="#a"/><use href="#a"/></g><use href="#b"/><use href="#b" transform="scale(3)"/>`,
      ),
    ).toBeCloseTo((2 * 0.01 + 2 * 0.01 + 2 * 0.09) * W.solid + 4 * edges(0.4) + 2 * edges(1.2), 9);
  });

  it("grows a stroke by half its width, more where a miter can reach, and charges it apart from the fill", () => {
    // Round joins: the outline of 40 at width 4 (160) and a cap or join at each of 5 vertices.
    const round = 2 * Math.SQRT2;
    const roundArea = Math.min((10 + 2 * round) ** 2, 40 * 4 + 5 * (2 * round) ** 2);
    expect(
      overdraw(
        '<rect width="10" height="10" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>',
      ),
    ).toBeCloseTo(
      (roundArea / 10_000) * W.solid +
        // Four round joins of half a turn at width 4, and two butt caps 4 across.
        strokeEdges(0.4, (4 * 2 * Math.PI + 2 * 4) / 100),
      9,
    );
    // Miter joins reach out to the miter limit, 4 by default.
    const miter = 4 * 2;
    const miterArea = Math.min((10 + 2 * miter) ** 2, 40 * 4 + 5 * (2 * miter) ** 2);
    expect(
      overdraw('<rect width="10" height="10" fill="#000" stroke="#000" stroke-width="4"/>'),
    ).toBeCloseTo(
      ((100 + miterArea) / 10_000) * W.solid +
        edges(0.4) +
        // Four miter joins up to 4 times 4 long, and two butt caps.
        strokeEdges(0.4, (4 * 16 + 2 * 4) / 100),
      9,
    );
    expect(overdraw('<line x2="50" stroke="#000" stroke-width="0"/>')).toBe(0);
  });

  it("charges a stroke's joins, and the caps of every subpath and of every dash, as edges", () => {
    const line = (attributes: string): number =>
      overdraw(`<path d="M0 50H100" fill="none" stroke="#000" stroke-width="10" ${attributes}/>`);
    // One miter join reaching 4 times 10 (an upper bound: a path's segments meet at most once each),
    // and a butt cap 10 across at each end of the one subpath; the line's box grown by the miter.
    const area = (extra: number): number =>
      Math.min(140 * 40, 100 * 10 + 2 * 40 ** 2 + extra) / 10_000;
    expect(line("")).toBeCloseTo(area(0) * W.solid + strokeEdges(1, (40 + 2 * 10) / 100), 9);
    // Dashes 5 long every 10: up to 10 whole ones and one more begun, each with two caps and as
    // much area again as a square cap could add.
    expect(line('stroke-dasharray="5"')).toBeCloseTo(
      area(11 * 100) * W.solid + strokeEdges(1, (40 + 2 * 11 * 10) / 100),
      9,
    );
    // A round cap is half a turn, a square one three sides of a square; each dash of four entries
    // has two; an offset moves the dashes but adds none.
    expect(line('stroke-dasharray="5" stroke-linecap="round"')).toBeCloseTo(
      area(11 * 100) * W.solid + strokeEdges(1, (40 + 2 * 11 * 5 * Math.PI) / 100),
      9,
    );
    expect(line('stroke-dasharray="5" stroke-linecap="square"')).toBeCloseTo(
      area(11 * 100) * W.solid + strokeEdges(1, (40 + 2 * 11 * 20) / 100),
      9,
    );
    expect(line('stroke-dasharray="1 2 3 4" stroke-dashoffset="3"')).toBeCloseTo(
      area(22 * 100) * W.solid + strokeEdges(1, (40 + 2 * 22 * 10) / 100),
      9,
    );
    // A dash of no length still has its caps.
    expect(line('stroke-dasharray="0 10" stroke-linecap="round"')).toBeCloseTo(
      area(11 * 100) * W.solid + strokeEdges(1, (40 + 2 * 11 * 5 * Math.PI) / 100),
      9,
    );
    // A dash array inherits, and none turns it off again.
    expect(
      overdraw(
        '<g stroke-dasharray="5"><path d="M0 50H100" fill="none" stroke="#000" stroke-width="10"/></g>',
      ),
    ).toBeCloseTo(line('stroke-dasharray="5"'), 9);
    expect(
      overdraw(
        '<g stroke-dasharray="5"><path d="M0 50H100" fill="none" stroke="#000" stroke-width="10" stroke-dasharray="none"/></g>',
      ),
    ).toBeCloseTo(line(""), 9);
    // No cap or join shows more than the image's perimeter.
    expect(
      overdraw(
        '<path d="M0 50H100" fill="none" stroke="#000" stroke-width="5000" stroke-linecap="round"/>',
      ),
    ).toBeCloseTo(W.solid + strokeEdges(1, 4 + 2 * 4), 9);
  });

  it("refuses wide strokes whose caps or joins crowd every row", () => {
    const wide = (data: string, attributes = ""): string =>
      svg(
        `<path d="${data}" fill="none" stroke="#000" stroke-width="1000" ${attributes}/>`,
        "0 0 1000 1000",
      );
    // The reviewer's: dashes a tenth long on a stroke as wide as the image.
    expect(refusal(payload("dashes-on-a-wide-stroke.svg"))).toBe("overdraw-too-large");
    expect(refusal(payload("square-dashes-on-a-wide-stroke.svg"))).toBe("overdraw-too-large");
    expect(accepted(wide("M0 500H1000", 'stroke-dasharray="1"')).ok).toBe(true);
    expect(refusal(wide("M0 500H1000", 'stroke-dasharray="0.2"'))).toBe("overdraw-too-large");
    // 5,000 subpaths of no length, each drawn as a round dot as wide as the image.
    const dots = Array.from({ length: 5000 }, (_, index) => `M${String(index / 5)} 500h0`).join("");
    expect(refusal(wide(dots, 'stroke-linecap="round"'))).toBe("overdraw-too-large");
    // 5,000 short segments, each meeting the next in a round join as wide as the image.
    const turns = `M500 500${" l1 0.5 l-1 0.5".repeat(2500)}`;
    expect(refusal(wide(turns, 'stroke-linejoin="round"'))).toBe("overdraw-too-large");
  });

  it("charges the caps of dashes closer together than the stroke is wide as crowding every row", () => {
    const dashed = (width: number, dash: number): number =>
      overdraw(
        `<path d="M0 500H1000" fill="none" stroke="#000" stroke-width="${String(width)}" stroke-dasharray="${String(dash)}"/>`,
        "0 0 1000 1000",
      );
    // Along a level line every cap of every dash crosses the same rows; where the stroke is wider
    // than the dashes are apart, some line of the path holds that many on a row of the stroke.
    const area = (width: number, pieces: number): number =>
      Math.min(
        (1000 + 2 * width * 2) * (width * 4),
        1000 * width + 2 * (4 * width) ** 2 + pieces * width ** 2,
      ) / 1e6;
    const ends = (width: number, pieces: number): number => (4 * width + 2 * pieces * width) / 1000;
    const crowded = (sides: number, crossings: number): number =>
      sides * W.edge * (1 + (Math.max(sides, crossings) / W.edgesPerRow) ** 2);
    // Dashes 1 long every 2 on a stroke 3 wide: 501 dashes, 1,002 caps on a row.
    expect(dashed(3, 1)).toBeCloseTo(
      Math.min(1, area(3, 501)) * W.solid + crowded(2 + ends(3, 501), 1002),
      9,
    );
    // Dashes 2 apart on a stroke 2 wide do not crowd: charged by their length alone.
    expect(dashed(2, 1)).toBeCloseTo(area(2, 501) * W.solid + strokeEdges(1, ends(2, 501)), 9);
    // The reviewer's ten thousand dashes on a stroke a tenth as wide as the image are refused.
    expect(
      refusal(
        svg(
          '<path d="M0 500H1000" fill="none" stroke="#000" stroke-width="100" stroke-dasharray="0.0476"/>',
          "0 0 1000 1000",
        ),
      ),
    ).toBe("overdraw-too-large");
  });

  it("inherits paint and stroke width from ancestors and from the use that draws a definition", () => {
    const defs = '<defs><rect id="a" width="10" height="10" fill="none"/></defs>';
    const wide = 10 + 2 * 4 * 2;
    expect(overdraw(`${defs}<g stroke="#000" stroke-width="4"><use href="#a"/></g>`)).toBeCloseTo(
      ((wide * wide) / 10_000) * W.solid + strokeEdges(0.4, (4 * 16 + 2 * 4) / 100),
      9,
    );
    expect(overdraw(`${defs}<use href="#a" stroke="#000" stroke-opacity="0.5"/>`)).toBeCloseTo(
      // A width of 1: the outline of 40 and a 4 by 4 miter at each of 5 vertices, under the box.
      ((40 + 5 * 16) / 10_000) * W.translucent + strokeEdges(0.4, (4 * 4 + 2) / 100),
      9,
    );
  });

  it("weighs each kind of paint", () => {
    const fill = (paint: string, defs = ""): number =>
      overdraw(`${defs}<rect ${SQUARE} ${paint}/>`) - edges(SQUARE_EDGES);
    const stops = (count: number, opacity = ""): string =>
      Array.from({ length: count }, () => `<stop stop-color="#123456"${opacity}/>`).join("");
    expect(fill('fill="#123456"')).toBeCloseTo(QUARTER * W.solid, 9);
    expect(fill('fill="#123456" fill-opacity="0.5"')).toBeCloseTo(QUARTER * W.translucent, 9);
    expect(fill('fill="transparent"')).toBeCloseTo(QUARTER * W.translucent, 9);
    expect(fill('fill="#123456" opacity="0.5"')).toBeCloseTo(QUARTER * W.translucent, 9);
    for (const [count, tier] of [
      [1, 2],
      [2, 2],
      [3, 4],
      [16, 16],
      [17, 32],
      [64, 64],
    ] as const) {
      const linear = `<linearGradient id="g">${stops(count)}</linearGradient>`;
      const radial = `<radialGradient id="g">${stops(count)}</radialGradient>`;
      const translucent = `<radialGradient id="g">${stops(count, ' stop-opacity="0.5"')}</radialGradient>`;
      expect(fill('fill="url(#g)"', linear)).toBeCloseTo(QUARTER * W.gradient[tier], 9);
      expect(fill('fill="url(#g)"', radial)).toBeCloseTo(QUARTER * W.gradient[tier], 9);
      expect(fill('fill="url(#g)"', translucent)).toBeCloseTo(
        QUARTER * W.translucentGradient[tier],
        9,
      );
      expect(fill('fill="url(#g)" fill-opacity="0.5"', linear)).toBeCloseTo(
        QUARTER * W.translucentGradient[tier],
        9,
      );
    }
    // A gradient that borrows its stops through href weighs as the stops it borrows.
    expect(
      fill(
        'fill="url(#h)"',
        `<linearGradient id="g">${stops(20)}</linearGradient><radialGradient id="h" href="#g"/>`,
      ),
    ).toBeCloseTo(QUARTER * W.gradient[32], 9);
  });

  it("charges group opacity a layer over the box of what the group draws", () => {
    const two = '<rect width="10" height="10"/><rect x="40" y="40" width="10" height="10"/>';
    expect(overdraw(`<g opacity="0.5">${two}</g>`) - overdraw(`<g>${two}</g>`)).toBeCloseTo(
      QUARTER * W.layer,
      9,
    );
    // A shape with both a fill and a stroke under opacity is drawn into a layer as well.
    const both = `<rect ${SQUARE} stroke="#000" stroke-width="0.000001"`;
    expect(overdraw(`${both} opacity="0.5"/>`) - overdraw(`${both}/>`)).toBeCloseTo(
      QUARTER * W.layer,
      4,
    );
  });

  it("charges a mask its area each time it is applied, with what it draws", () => {
    const content = `<rect ${SQUARE} fill="#fff"/>`;
    const masked = (mask: string): number =>
      overdraw(`<mask id="m"${mask}>${content}</mask><rect ${SQUARE} mask="url(#m)"/>`);
    const plain = overdraw(`<rect ${SQUARE}/>`);
    const drawnInMask = overdraw(content);
    expect(masked("")).toBeCloseTo(plain + drawnInMask + QUARTER * W.mask, 9);
    expect(masked(' mask-type="alpha"')).toBeCloseTo(
      plain + drawnInMask + QUARTER * W.alphaMask,
      9,
    );
    expect(
      overdraw(
        `<defs><mask id="m">${content}</mask><rect id="r" ${SQUARE} mask="url(#m)"/></defs><use href="#r"/><use href="#r"/>`,
      ),
    ).toBeCloseTo(2 * (plain + drawnInMask + QUARTER * W.mask), 9);
  });

  it("charges a path whose edges crowd every row more than in proportion to them", () => {
    // A zigzag of `count` edges, each a little longer than the image is tall, all on every row.
    const zigzag = (count: number): string =>
      `<path d="M0 0${Array.from({ length: count }, (_, index) => `L${String(((index + 1) * 100) / count)} ${index % 2 === 0 ? "100" : "0"}`).join("")}" fill="#000"/>`;
    const sparse = overdraw(zigzag(500));
    expect(sparse).toBeGreaterThan(edges(500));
    expect(sparse).toBeLessThan(1 + edges(501));
    // Twice the edges on every row cost more than twice as much: 3,000 drawn once are refused,
    // while charged in proportion they would come to a fifth of the limit.
    expect(refusal(svg(zigzag(3000)))).toBe("overdraw-too-large");
    expect(3000 * W.edge).toBeLessThan(SVG_LOGO_LIMITS.overdraw / 5);
  });

  it("charges a clip path its area and the coverage and edges of what it holds, each time it is applied", () => {
    const clipped = (content: string): number =>
      overdraw(`<clipPath id="c">${content}</clipPath><rect ${SQUARE} clip-path="url(#c)"/>`);
    const plain = overdraw(`<rect ${SQUARE}/>`);
    // Paint does not matter inside a clip path: only coverage.
    expect(
      clipped('<rect width="10" height="10" fill="url(#nowhere)" stroke="#000"/>'),
    ).toBeCloseTo(plain + QUARTER * W.clip + 0.01 * W.solid + edges(0.4), 9);
    // Edges are charged by their length, so a clip path of long edges costs what it draws.
    const zigzag = `M0 0${Array.from({ length: 50 }, (_, index) => `L${String(2 * index + 1)} ${index % 2 === 0 ? "100" : "0"}`).join("")}Z`;
    expect(clipped(`<path d="${zigzag}"/>`)).toBeGreaterThan(plain + edges(50));
  });

  it("charges a clip path holding more than one shape, or a shape clipped in turn, as an alpha mask", () => {
    const clipped = (content: string, defs = ""): number =>
      overdraw(
        `<defs>${defs}</defs><clipPath id="c">${content}</clipPath><rect ${SQUARE} clip-path="url(#c)"/>`,
      );
    const plain = overdraw(`<rect ${SQUARE}/>`);
    const small = 0.01 * W.solid + edges(0.4);
    expect(
      clipped('<rect width="10" height="10"/><rect x="20" width="10" height="10"/>'),
    ).toBeCloseTo(plain + QUARTER * W.alphaMask + 2 * small, 9);
    // A shape a use draws into the clip path counts as one, but its own clip path makes it a mask.
    const inner = '<clipPath id="k"><rect width="5" height="5"/></clipPath>';
    expect(clipped('<use href="#r"/>', '<rect id="r" width="10" height="10"/>')).toBeCloseTo(
      plain + QUARTER * W.clip + small,
      9,
    );
    expect(
      clipped(
        '<use href="#r"/>',
        `${inner}<rect id="r" width="10" height="10" clip-path="url(#k)"/>`,
      ),
    ).toBeCloseTo(
      plain + QUARTER * W.alphaMask + small + 0.01 * W.clip + 0.0025 * W.solid + edges(0.2),
      9,
    );
  });

  it("draws a clip path's content through the clip path's own transform", () => {
    const plain = overdraw(`<rect ${SQUARE}/>`);
    expect(
      overdraw(
        `<clipPath id="c" transform="scale(2)"><rect width="10" height="10"/></clipPath><rect ${SQUARE} clip-path="url(#c)"/>`,
      ),
    ).toBeCloseTo(plain + QUARTER * W.clip + 0.04 * W.solid + edges(0.8), 9);
    // In bounding box units, the transform applies to the box's units.
    expect(
      overdraw(
        `<clipPath id="c" clipPathUnits="objectBoundingBox" transform="scale(0.5)"><rect width="1" height="1"/></clipPath><rect ${SQUARE} clip-path="url(#c)"/>`,
      ),
    ).toBeCloseTo(plain + QUARTER * W.clip + 0.0625 * W.solid + edges(1), 9);
  });
});

describe("the overdraw limit", () => {
  it.each([
    ["a 64-stop radial gradient filling and stroking 5,373 times", "overdraw-gradient-both.svg"],
    ["a 64-stop radial gradient filling 5,373 times", "overdraw-gradient-fill.svg"],
  ])("refuses %s", (_label, name) => {
    expect(refusal(payload(name))).toBe("overdraw-too-large");
  });

  it("accepts up to the limit and refuses past it", () => {
    const solid = (count: number): string =>
      svg(`<defs><path id="r" d="M0 0H100V100H0Z"/></defs>${'<use href="#r"/>'.repeat(count)}`);
    const each = W.solid + edges(4);
    const most = Math.floor(SVG_LOGO_LIMITS.overdraw / each);
    expect(accepted(solid(most)).overdraw).toBeCloseTo(most * each, 6);
    expect(refusal(solid(most + 1))).toBe("overdraw-too-large");
  });

  it("refuses transforms composed past a million times a million, so no number overflows", () => {
    const nest = (transforms: readonly string[]): string =>
      svg(
        transforms.map((transform) => `<g transform="${transform}">`).join("") +
          '<rect width="1" height="1"/>' +
          "</g>".repeat(transforms.length),
      );
    const scale = "scale(999999)";
    expect(refusal(nest([Array(16).fill(scale).join(" ")]))).toBe("number-out-of-range");
    expect(refusal(nest([scale, scale, "scale(2)"]))).toBe("number-out-of-range");
    expect(refusal(nest([scale, scale, "translate(2)"]))).toBe("number-out-of-range");
    expect(refusal(nest(["skewX(90)"]))).toBe("number-out-of-range");
    // Up to the bound, and anything that shrinks, is drawn.
    expect(accepted(nest([scale, scale])).overdraw).toBeCloseTo(W.solid + edges(4), 9);
    expect(accepted(nest(Array(30).fill("scale(0.000001)"))).overdraw).toBe(0);
    // A matrix that flattens the square to a line paints no area, only an edge.
    expect(accepted(nest(["scale(0 1)", "matrix(1 1 1 1 0 0)"])).overdraw).toBeCloseTo(
      edges((Math.SQRT2 * 4) / 100),
      9,
    );
    // A use's offset and a clip path's or a mask's bounding box compose too.
    expect(
      refusal(
        svg(
          `<defs><rect id="r" width="1" height="1"/></defs><g transform="${scale} ${scale}"><use href="#r" x="999999"/></g>`,
        ),
      ),
    ).toBe("number-out-of-range");
  });

  it("refuses the reviewer's transforms that overflowed to a budget that was not a number", () => {
    expect(refusal(payload("transform-overflow-nan.svg"))).toBe("number-out-of-range");
  });

  it("reports only finite numbers, however transforms are nested", () => {
    const random = seeded(15_005);
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)] as T;
    const magnitudes = ["999999", "123456.5", "1000", "1", "0.5", "0.000001", "0"];
    const number = (): string => `${random() < 0.5 ? "-" : ""}${pick(magnitudes)}`;
    const functions = [
      (): string => `scale(${number()} ${number()})`,
      (): string => `translate(${number()} ${number()})`,
      (): string => `rotate(${number()})`,
      (): string => `skewX(${pick(["89.999999", "-89.999999", "45", "90"])})`,
      (): string => `matrix(${Array.from({ length: 6 }, number).join(" ")})`,
      // A run that overflows within a few levels, or underflows to nothing.
      (): string =>
        Array(8)
          .fill(`scale(${pick(["999999", "-999999", "0.000001"])})`)
          .join(" "),
    ];
    const transform = (): string =>
      Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(functions)()).join(" ");
    for (let index = 0; index < 400; index += 1) {
      const depth = 1 + Math.floor(random() * 6);
      const body =
        Array.from({ length: depth }, () => `<g transform="${transform()}">`).join("") +
        pick([
          '<rect width="10" height="10" stroke="#000"/>',
          '<path d="M0 0C10 0 10 10 0 10Z" fill="url(#g)"/>',
          '<use href="#r" x="999999"/>',
          '<rect width="10" height="10" clip-path="url(#c)" mask="url(#m)"/>',
        ]) +
        "</g>".repeat(depth);
      const defs =
        '<defs><linearGradient id="g"><stop/></linearGradient><rect id="r" width="5" height="5"/>' +
        `<clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="1" height="1" transform="${transform()}"/></clipPath>` +
        `<mask id="m" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="#fff" transform="${transform()}"/></mask></defs>`;
      const result = sanitiseSvgLogo(svg(defs + body));
      if (result.ok) {
        for (const value of [result.width, result.height, ...result.viewBox]) {
          expect(Number.isFinite(value)).toBe(true);
        }
        expect(result.drawingCost).toBeGreaterThanOrEqual(0);
        expect(result.drawingCost).toBeLessThanOrEqual(SVG_LOGO_LIMITS.drawingCost);
        expect(result.overdraw).toBeGreaterThanOrEqual(0);
        expect(result.overdraw).toBeLessThanOrEqual(SVG_LOGO_LIMITS.overdraw);
      } else {
        expect(["number-out-of-range", "overdraw-too-large"]).toContain(result.errors[0]?.code);
      }
    }
  });

  it("checks the overdraw only after the other limits on what drawing takes", () => {
    const masks = `<mask id="m"><rect width="100" height="100"/></mask>${'<rect width="100" height="100" mask="url(#m)"/>'.repeat(SVG_LOGO_LIMITS.maskApplications + 1)}`;
    expect(refusal(svg(masks))).toBe("too-many-masks");
  });
});
