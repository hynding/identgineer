import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { dashPeriod, measurePathData, SVG_DRAWING_WEIGHTS } from "./svg-drawing-cost.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoAccepted, SvgLogoErrorCode } from "./svg-logo-result.ts";

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
  ])("weighs %s at %d and bounds its length by %d", (data, weight, length) => {
    const measured = measurePathData(data);
    expect(measured.weight).toBe(weight);
    expect(measured.length).toBeCloseTo(length, 6);
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
  ])("reads %s as a period of %d user units", (value, period) => {
    expect(dashPeriod(value)).toBeCloseTo(period, 9);
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

  it("counts the dashes of every shape a dash array could reach, with the shortest period in the logo", () => {
    expect(cost('<path d="M0 0H100" stroke-dasharray="1"/>')).toBe(84);
    expect(
      cost('<g stroke-dasharray="10"><path d="M0 0H100"/><rect width="10" height="10"/></g>'),
    ).toBe(78);
    expect(cost('<path d="M0 0H100"/><path d="M0 0H1" stroke-dasharray="1 1"/>')).toBe(118);
    expect(cost('<rect width="100%" height="100%" stroke-dasharray="1"/>')).toBe(57);
    expect(cost('<path d="M0 0H100" stroke-dasharray="0 0"/>')).toBe(34);
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

  it("bounds how often the shapes of clip paths could cross one another", () => {
    expect(SVG_LOGO_LIMITS.clipCrossings).toBe(10_000);
    // Two shapes in one clip path are combined into one outline, work that grows with how often
    // they cross: at most the product of their segments, each weighted by its degree.
    const lines = (count: number): string =>
      `M0 0${Array.from({ length: count - 1 }, (_, index) => `L${String(index % 2 === 0 ? 10 : 0)} ${String(index / count)}`).join("")}Z`;
    const clipped = (shapes: string, defs = ""): string =>
      svg(
        `<defs>${defs}</defs><clipPath id="c">${shapes}</clipPath><rect width="10" height="10" clip-path="url(#c)"/>`,
      );
    const pair = (count: number): string =>
      clipped(`<path d="${lines(count)}"/><path d="${lines(count)}" transform="rotate(90 5 5)"/>`);
    expect(accepted(pair(100)).ok).toBe(true);
    expect(refusal(pair(101))).toBe("drawing-too-costly");
    // One shape alone is not combined with anything, however many segments it has.
    expect(accepted(clipped(`<path d="M0 0${" l0.001 0.001".repeat(5000)}"/>`)).ok).toBe(true);
    // A cubic crosses a line up to three times, a quadratic or an arc twice; a circle or ellipse
    // is four arcs, a rounded rectangle four lines and four arcs.
    const cubics = `M0 0${" C1 1 2 2 3 3".repeat(34)}`;
    expect(accepted(clipped(`<path d="${cubics}"/><path d="${lines(98)}"/>`)).ok).toBe(true);
    expect(refusal(clipped(`<path d="${cubics}"/><path d="${lines(99)}"/>`))).toBe(
      "drawing-too-costly",
    );
    const circles = (count: number): string => '<circle r="5"/>'.repeat(count);
    // n circles: n(n - 1)/2 pairs of 8 by 8.
    expect(accepted(clipped(circles(18))).ok).toBe(true);
    expect(refusal(clipped(circles(19)))).toBe("drawing-too-costly");
    expect(
      accepted(clipped(`<path d="${lines(833)}"/><rect width="1" height="1" rx="0.5"/>`)).ok,
    ).toBe(true);
    expect(
      refusal(
        clipped(
          `<path d="${lines(833)}"/><rect width="1" height="1" rx="0.5"/>` +
            '<path d="M0 0Q1 1 2 0"/>',
        ),
      ),
    ).toBe("drawing-too-costly");
    // A use counts what it draws; the counts of every clip path add up.
    expect(
      refusal(clipped(`<use href="#p"/><use href="#p"/>`, `<path id="p" d="${lines(101)}"/>`)),
    ).toBe("drawing-too-costly");
    const two = (id: string, count: number): string =>
      `<clipPath id="${id}"><path d="${lines(count)}"/><path d="${lines(count)}"/></clipPath>`;
    expect(accepted(svg(two("a", 70) + two("b", 70))).ok).toBe(true);
    expect(refusal(svg(two("a", 71) + two("b", 71)))).toBe("drawing-too-costly");
  });

  it("refuses the reviewer's clip path of two zigzags crossing 40,000 times", () => {
    const payload = readFileSync(
      new URL("./__fixtures__/hostile-svg/clip-path-crossing-zigzags.svg", import.meta.url),
      "utf8",
    );
    expect(refusal(payload)).toBe("drawing-too-costly");
  });

  it("accepts masks applied up to the limit and refuses one more", () => {
    // Small ones, so what they paint stays well within the overdraw limit.
    expect(accepted(nestedMasks(1, SVG_LOGO_LIMITS.maskApplications, 10)).ok).toBe(true);
    expect(refusal(nestedMasks(1, SVG_LOGO_LIMITS.maskApplications + 1, 10))).toBe(
      "too-many-masks",
    );
  });
});
