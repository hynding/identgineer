import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoAccepted, SvgLogoErrorCode } from "./svg-logo-result.ts";
import { SVG_OVERDRAW_WEIGHTS } from "./svg-overdraw.ts";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const W = SVG_OVERDRAW_WEIGHTS;

/** A 100 by 100 view box: one unit of overdraw is 10,000 square user units painted solid. */
function svg(body: string, viewBox = "0 0 100 100"): string {
  return `<svg ${NS} viewBox="${viewBox}">${body}</svg>`;
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

describe("the overdraw of a logo", () => {
  it("is nothing for a logo that paints nothing", () => {
    expect(overdraw("")).toBe(0);
    expect(overdraw(`<rect ${SQUARE} fill="none"/>`)).toBe(0);
    expect(overdraw(`<defs><rect id="r" ${SQUARE}/></defs>`)).toBe(0);
    expect(overdraw(`<rect ${SQUARE} display="none"/>`)).toBe(0);
  });

  it("charges a solid fill its area, as a share of the square on the larger side, and its edges", () => {
    expect(overdraw(`<rect ${SQUARE}/>`)).toBeCloseTo(QUARTER * W.solid + SQUARE_EDGES * W.edge, 9);
    expect(overdraw(`<rect ${SQUARE} fill="#123456"/>`, "0 0 100 50")).toBeCloseTo(
      QUARTER * W.solid + SQUARE_EDGES * W.edge,
      9,
    );
    expect(overdraw('<circle r="50"/>')).toBeCloseTo((Math.PI / 4) * W.solid + Math.PI * W.edge, 9);
    expect(overdraw('<path d="M0 0H50V50H0Z"/>')).toBeCloseTo(
      QUARTER * W.solid + SQUARE_EDGES * W.edge,
      9,
    );
  });

  it("bounds a path by the boxes of its subpaths, control points included", () => {
    // Two 10 by 10 squares far apart cover 200 square units, not the 8,100 of their common box.
    expect(overdraw('<path d="M0 0h10v10h-10zM80 80h10v10h-10z"/>')).toBeCloseTo(
      0.02 * W.solid + 0.8 * W.edge,
      9,
    );
    // A curve stays inside the box of its control points: 50 by 50 here.
    expect(overdraw('<path d="M0 0C0 50 50 50 50 0Z"/>')).toBeCloseTo(
      QUARTER * W.solid + (50 + 50 + 50 + 50) * 0.01 * W.edge,
      9,
    );
  });

  it("charges an instance at most the whole image, however far it reaches", () => {
    // A rectangle is convex: no more of its outline than the image's perimeter can be seen.
    expect(overdraw('<rect x="-500" y="-500" width="5000" height="5000"/>')).toBeCloseTo(
      W.solid + 4 * W.edge,
      9,
    );
  });

  it("bounds how much of each segment's edge can be seen by its kind", () => {
    const hairline = 'fill="none" stroke="#000" stroke-width="0.000001"';
    const edges = (data: string): number => overdraw(`<path d="${data}" ${hairline}/>`);
    // A straight segment shows at most the image's diagonal.
    expect(edges("M-1000 -1000L1000 1000")).toBeCloseTo(Math.SQRT2 * W.edge, 5);
    // A quadratic curve or an arc is convex: at most the image's perimeter.
    expect(edges("M-1000 0Q50 5000 1000 0")).toBeCloseTo(4 * W.edge, 5);
    expect(edges("M0 0A1000 1000 0 1 1 1 0")).toBeCloseTo(4 * W.edge, 5);
    // A cubic bends at most twice: three convex pieces.
    expect(edges("M-1000 0C3000 5000 -3000 5000 1000 0")).toBeCloseTo(12 * W.edge, 5);
    // Short of those, the outline's own length.
    expect(edges("M0 0Q50 50 100 0")).toBeCloseTo(Math.SQRT2 * W.edge, 5);
  });

  it("carries the area through transforms, ancestors' and use's included", () => {
    expect(overdraw(`<rect ${SQUARE} transform="scale(2 0.5)"/>`)).toBeCloseTo(
      QUARTER * W.solid + 2 * SQUARE_EDGES * W.edge,
      9,
    );
    // Rotation keeps the area; the outline is no longer.
    expect(overdraw(`<rect ${SQUARE} transform="rotate(45)"/>`)).toBeCloseTo(
      QUARTER * W.solid + SQUARE_EDGES * W.edge,
      9,
    );
    const defs = '<defs><rect id="a" width="10" height="10"/></defs>';
    expect(
      overdraw(
        `${defs}<g transform="scale(2)"><use href="#a" transform="scale(2)"/><use href="#a" x="20"/></g>`,
      ),
    ).toBeCloseTo((0.16 + 0.04) * W.solid + (1.6 + 0.8) * W.edge, 9);
    // A use of a use is drawn as often as it is reached.
    expect(
      overdraw(
        `${defs}<g id="b"><use href="#a"/><use href="#a"/></g><use href="#b"/><use href="#b" transform="scale(3)"/>`,
      ),
    ).toBeCloseTo((2 * 0.01 + 2 * 0.01 + 2 * 0.09) * W.solid + (4 * 0.4 + 2 * 1.2) * W.edge, 9);
  });

  it("grows a stroke by half its width, more where a miter can reach, and charges it apart from the fill", () => {
    // Round joins: the outline of 40 at width 4 (160) and a cap or join at each of 5 vertices.
    const round = 2 * Math.SQRT2;
    const roundArea = Math.min((10 + 2 * round) ** 2, 40 * 4 + 5 * (2 * round) ** 2);
    expect(
      overdraw(
        '<rect width="10" height="10" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>',
      ),
    ).toBeCloseTo((roundArea / 10_000) * W.solid + 0.4 * W.edge, 9);
    // Miter joins reach out to the miter limit, 4 by default.
    const miter = 4 * 2;
    const miterArea = Math.min((10 + 2 * miter) ** 2, 40 * 4 + 5 * (2 * miter) ** 2);
    expect(
      overdraw('<rect width="10" height="10" fill="#000" stroke="#000" stroke-width="4"/>'),
    ).toBeCloseTo(((100 + miterArea) / 10_000) * W.solid + 0.8 * W.edge, 9);
    expect(overdraw('<line x2="50" stroke="#000" stroke-width="0"/>')).toBe(0);
  });

  it("inherits paint and stroke width from ancestors and from the use that draws a definition", () => {
    const defs = '<defs><rect id="a" width="10" height="10" fill="none"/></defs>';
    const wide = 10 + 2 * 4 * 2;
    expect(overdraw(`${defs}<g stroke="#000" stroke-width="4"><use href="#a"/></g>`)).toBeCloseTo(
      ((wide * wide) / 10_000) * W.solid + 0.4 * W.edge,
      9,
    );
    expect(overdraw(`${defs}<use href="#a" stroke="#000" stroke-opacity="0.5"/>`)).toBeCloseTo(
      // A width of 1: the outline of 40 and a 4 by 4 miter at each of 5 vertices, under the box.
      ((40 + 5 * 16) / 10_000) * W.translucent + 0.4 * W.edge,
      9,
    );
  });

  it("weighs each kind of paint", () => {
    const fill = (paint: string, defs = ""): number =>
      overdraw(`${defs}<rect ${SQUARE} ${paint}/>`) - SQUARE_EDGES * W.edge;
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
    const both = `<rect ${SQUARE} stroke="#000" stroke-width="0.0001"`;
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

  it("charges a clip path its area and the coverage and edges of what it holds, each time it is applied", () => {
    const clipped = (content: string): number =>
      overdraw(`<clipPath id="c">${content}</clipPath><rect ${SQUARE} clip-path="url(#c)"/>`);
    const plain = overdraw(`<rect ${SQUARE}/>`);
    // Paint does not matter inside a clip path: only coverage.
    expect(
      clipped('<rect width="10" height="10" fill="url(#nowhere)" stroke="#000"/>'),
    ).toBeCloseTo(plain + QUARTER * W.clip + 0.01 * W.solid + 0.4 * W.edge, 9);
    // Edges are charged by their length, so a clip path of long edges costs what it draws.
    const zigzag = `M0 0${Array.from({ length: 50 }, (_, index) => `L${String(2 * index + 1)} ${index % 2 === 0 ? "100" : "0"}`).join("")}Z`;
    expect(clipped(`<path d="${zigzag}"/>`)).toBeGreaterThan(plain + 50 * W.edge);
  });
});

describe("the overdraw limit", () => {
  const payload = (name: string): string =>
    readFileSync(new URL(`./__fixtures__/hostile-svg/${name}`, import.meta.url), "utf8");

  it.each([
    ["a 64-stop radial gradient filling and stroking 5,373 times", "overdraw-gradient-both.svg"],
    ["a 64-stop radial gradient filling 5,373 times", "overdraw-gradient-fill.svg"],
  ])("refuses %s", (_label, name) => {
    expect(refusal(payload(name))).toBe("overdraw-too-large");
  });

  it("accepts up to the limit and refuses past it", () => {
    const solid = (count: number): string =>
      svg(`<defs><path id="r" d="M0 0H100V100H0Z"/></defs>${'<use href="#r"/>'.repeat(count)}`);
    const each = W.solid + 4 * W.edge;
    const most = Math.floor(SVG_LOGO_LIMITS.overdraw / each);
    expect(accepted(solid(most)).overdraw).toBeCloseTo(most * each, 6);
    expect(refusal(solid(most + 1))).toBe("overdraw-too-large");
  });

  it("checks the overdraw only after the other limits on what drawing takes", () => {
    const masks = `<mask id="m"><rect width="100" height="100"/></mask>${'<rect width="100" height="100" mask="url(#m)"/>'.repeat(SVG_LOGO_LIMITS.maskApplications + 1)}`;
    expect(refusal(svg(masks))).toBe("too-many-masks");
  });
});
