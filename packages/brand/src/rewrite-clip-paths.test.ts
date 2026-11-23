import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import type { SvgLogoAccepted } from "./svg-logo-result.ts";
import { findSanitisedSvgProblems } from "./svg-output-check.ts";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ROOT = `<svg ${NS} viewBox="0 0 100 100" width="100" height="100">`;
/** What each shape a rewritten clip path held is drawn with in its mask: opaque, unstroked. */
const PAINT =
  'fill="#ffffff" fill-opacity="1" fill-rule="nonzero" stroke="none" visibility="visible"';

function accepted(body: string): SvgLogoAccepted {
  const result = sanitiseSvgLogo(`${ROOT}${body}</svg>`);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  expect(findSanitisedSvgProblems(result.svg)).toEqual([]);
  const again = sanitiseSvgLogo(result.svg);
  expect(again.ok && again.svg).toBe(result.svg);
  return result;
}

function inner(result: SvgLogoAccepted): string {
  return result.svg.slice(ROOT.length, -"</svg>".length);
}

const TWO_CIRCLES = '<circle cx="30" cy="50" r="20"/><circle cx="70" cy="50" r="20"/>';

describe("clip paths of more than one shape", () => {
  it("are rewritten as alpha masks of the same shapes, opaque, over a region holding them all", () => {
    const result = accepted(
      `<clipPath id="c">${TWO_CIRCLES}</clipPath><rect width="100" height="100" clip-path="url(#c)"/>`,
    );
    // The shapes' box, 10 to 90 by 30 to 70, grown by a tenth of its larger side all round.
    expect(inner(result)).toBe(
      '<mask id="logo-0" x="2" y="22" width="96" height="56" maskUnits="userSpaceOnUse" mask-type="alpha">' +
        `<circle cx="30" cy="50" r="20" ${PAINT}/><circle cx="70" cy="50" r="20" ${PAINT}/></mask>` +
        '<rect width="100" height="100" mask="url(#logo-0)"/>',
    );
    expect(result.removed).toEqual([
      expect.objectContaining({ element: "clipPath", reason: "rewritten", line: 1 }),
    ]);
  });

  it("keep a clip path of one shape as it is, however long or self-crossing", () => {
    const zigzag = `M0 0${Array.from({ length: 400 }, (_, index) => `L${String(index % 2 === 0 ? 100 : 0)} ${String(index / 4)}`).join("")}Z`;
    const body = `<clipPath id="c"><path d="${zigzag}"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>`;
    expect(inner(accepted(body))).toBe(
      body.replaceAll("#c", "#logo-0").replace('id="c"', 'id="logo-0"'),
    );
  });

  it("fill each shape by its clip rule, inherited from the clip path and what holds it", () => {
    const masked = inner(
      accepted(
        `<g clip-rule="evenodd"><clipPath id="c">${TWO_CIRCLES.replace("/>", ' clip-rule="nonzero"/>')}</clipPath></g>` +
          '<rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(masked).toContain(
      '<circle cx="30" cy="50" r="20" fill="#ffffff" fill-opacity="1" fill-rule="nonzero"',
    );
    expect(masked).toContain(
      '<circle cx="70" cy="50" r="20" fill="#ffffff" fill-opacity="1" fill-rule="evenodd"',
    );
  });

  it("leave out what a clip path ignores: shapes not displayed or hidden, and uses of anything but a shape", () => {
    const result = accepted(
      '<g id="g"><rect width="5" height="5"/></g><rect id="h" width="5" height="5" display="none"/>' +
        `<clipPath id="c">${TWO_CIRCLES}` +
        '<rect width="9" height="9" display="none"/><rect width="9" height="9" visibility="hidden"/>' +
        '<use href="#g"/><use href="#h"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>',
    );
    const masked = inner(result);
    expect(masked.match(/<circle/g)).toHaveLength(2);
    expect(masked).not.toContain('width="9"');
    expect(masked).not.toContain("<use");
    expect(result.removed.map(({ element, reason }) => [element, reason])).toEqual([
      ["rect", "render-cost"],
      ["rect", "render-cost"],
      ["use", "misplaced"],
      ["use", "render-cost"],
      ["clipPath", "rewritten"],
    ]);
  });

  it("keep a clip path whose other shapes are hidden as a clip path of the one shown", () => {
    const result = accepted(
      `<clipPath id="c" visibility="hidden">${TWO_CIRCLES.replace("/>", ' visibility="visible"/>')}</clipPath>` +
        '<rect width="100" height="100" clip-path="url(#c)"/>',
    );
    expect(inner(result)).toBe(
      '<clipPath id="logo-0" visibility="hidden"><circle cx="30" cy="50" r="20" visibility="visible"/></clipPath>' +
        '<rect width="100" height="100" clip-path="url(#logo-0)"/>',
    );
    expect(result.removed.map(({ element, reason }) => [element, reason])).toEqual([
      ["circle", "render-cost"],
    ]);
  });

  it("draw a use's target bare, under the use's transform and position, with its own transform", () => {
    const masked = inner(
      accepted(
        '<rect id="t" width="10" height="10" transform="scale(2)" fill="red" stroke="blue" stroke-width="40" opacity="0.5"/>' +
          '<clipPath id="c"><use href="#t" x="5" transform="translate(1 1)" fill-opacity="0.2"/><rect x="60" width="10" height="10"/></clipPath>' +
          '<rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(masked).toContain(
      `<g transform="translate(1 1) translate(5 0)"><rect width="10" height="10" transform="scale(2)" ${PAINT}/></g>`,
    );
  });

  it("keep a use target's own clip path, rewriting a clip path of one shape clipped in turn", () => {
    const masked = inner(
      accepted(
        '<clipPath id="k"><rect width="50" height="50"/></clipPath>' +
          '<rect id="t" width="80" height="80" clip-path="url(#k)" mask="url(#m)"/><mask id="m"><rect width="9" height="9" fill="#fff"/></mask>' +
          '<clipPath id="c"><use href="#t"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(masked).toContain(
      '<mask id="logo-2" x="-8" y="-8" width="96" height="96" maskUnits="userSpaceOnUse" mask-type="alpha">' +
        '<rect width="80" height="80" fill="#ffffff" fill-opacity="1" fill-rule="nonzero" stroke="none" clip-path="url(#logo-0)" visibility="visible"/></mask>',
    );
  });

  it("put a clip path's transform on a group in the mask, and map the region through it", () => {
    expect(
      inner(
        accepted(
          '<clipPath id="c" transform="translate(10 0)"><rect width="10" height="10"/><rect x="20" width="10" height="10"/></clipPath>' +
            '<rect width="100" height="100" clip-path="url(#c)"/>',
        ),
      ),
    ).toContain(
      '<mask id="logo-0" x="7" y="-3" width="36" height="16" maskUnits="userSpaceOnUse" mask-type="alpha"><g transform="translate(10 0)">' +
        `<rect width="10" height="10" ${PAINT}/><rect x="20" width="10" height="10" ${PAINT}/></g></mask>`,
    );
  });

  it("keep a clip path in the box of what it clips as a mask in that box, its region too", () => {
    expect(
      inner(
        accepted(
          '<clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="0.5" height="0.5"/><rect x="0.5" y="0.5" width="0.5" height="0.5"/></clipPath>' +
            '<rect x="10" width="50" height="20" clip-path="url(#c)"/>',
        ),
      ),
    ).toContain(
      '<mask id="logo-0" x="-0.1" y="-0.1" width="1.2" height="1.2" maskContentUnits="objectBoundingBox" mask-type="alpha">',
    );
  });

  it("share one mask among every element that used the clip path, written in style too", () => {
    const masked = inner(
      accepted(
        `<clipPath id="c">${TWO_CIRCLES}</clipPath>` +
          '<rect width="100" height="100" clip-path="url(#c)"/><circle r="9" style="clip-path:url(#c)"/>',
      ),
    );
    expect(masked.match(/<mask /g)).toHaveLength(1);
    expect(masked).toContain('<rect width="100" height="100" mask="url(#logo-0)"/>');
    expect(masked).toContain('<circle r="9" mask="url(#logo-0)"/>');
  });

  it("move an element that has a mask of its own into a group carrying its transform, its id and the clip", () => {
    const masked = inner(
      accepted(
        `<clipPath id="c">${TWO_CIRCLES}</clipPath><mask id="m"><rect width="100" height="50" fill="#fff"/></mask>` +
          '<rect id="r" width="100" height="100" transform="translate(1 2)" clip-path="url(#c)" mask="url(#m)" opacity="0.5"/>' +
          '<use href="#r" x="3"/>',
      ),
    );
    expect(masked).toContain(
      '<g id="logo-2" transform="translate(1 2)" mask="url(#logo-0)"><rect width="100" height="100" opacity="0.5" mask="url(#logo-1)"/></g><use href="#logo-2" x="3"/>',
    );
  });

  it("move a clip path on the root to a mask on the root, both in the root's own space", () => {
    const result = sanitiseSvgLogo(
      `<svg ${NS} viewBox="0 0 100 100" width="100" height="100" clip-path="url(#c)"><clipPath id="c">${TWO_CIRCLES}</clipPath><rect width="100" height="100"/></svg>`,
    );
    expect(result.ok && result.svg).toContain('height="100" mask="url(#logo-0)"><mask id="logo-0"');
  });

  it("refuse a clip path of more than one shape on a root that has a mask of its own", () => {
    // The root's clip path and mask both work in the space around it, in CSS pixels, which nothing
    // inside the root can stand in for at every size the logo is drawn.
    const result = sanitiseSvgLogo(
      `<svg ${NS} viewBox="0 0 100 100" width="100" height="100" clip-path="url(#c)" mask="url(#m)">` +
        `<clipPath id="c">${TWO_CIRCLES}</clipPath><mask id="m"><rect width="100" height="50" fill="#fff"/></mask><rect width="100" height="100"/></svg>`,
    );
    expect(result.ok || result.errors[0]).toEqual(
      expect.objectContaining({ code: "drawing-too-costly", line: 1, column: 1 }),
    );
  });

  it("swap a clip path in a mask's content too", () => {
    expect(
      inner(
        accepted(
          `<clipPath id="c">${TWO_CIRCLES}</clipPath><mask id="m"><rect width="100" height="100" fill="#fff" clip-path="url(#c)"/></mask>` +
            '<rect width="100" height="100" mask="url(#m)"/>',
        ),
      ),
    ).toContain(
      '<mask id="logo-1"><rect width="100" height="100" fill="#ffffff" mask="url(#logo-0)"/></mask>',
    );
  });

  it("count each rewritten clip path as a mask applied, nested inside any it is applied within", () => {
    const nested = (depth: number): string => {
      let body = `<clipPath id="c">${TWO_CIRCLES}</clipPath>`;
      for (let index = 0; index < depth; index += 1) {
        body += `<mask id="m${String(index)}"><rect width="100" height="100" fill="#fff"${index === 0 ? ' clip-path="url(#c)"' : ` mask="url(#m${String(index - 1)})"`}/></mask>`;
      }
      return `${ROOT}${body}<rect width="100" height="100" mask="url(#m${String(depth - 1)})"/></svg>`;
    };
    expect(sanitiseSvgLogo(nested(3)).ok).toBe(true);
    const refused = sanitiseSvgLogo(nested(4));
    expect(refused.ok || refused.errors[0]?.code).toBe("masks-too-deep");
  });
});

describe("the output check", () => {
  it("refuses a clip path of more than one shape, or a use in one of anything but a plain shape", () => {
    const check = (body: string): string[] => findSanitisedSvgProblems(`${ROOT}${body}</svg>`);
    expect(check(`<clipPath id="logo-0">${TWO_CIRCLES}</clipPath>`)).not.toEqual([]);
    expect(
      check(
        '<g id="logo-0"><rect width="1" height="1"/></g><clipPath id="logo-1"><use href="#logo-0"/></clipPath>',
      ),
    ).not.toEqual([]);
    expect(
      check(
        '<clipPath id="logo-0"><rect width="1" height="1"/></clipPath><rect id="logo-1" width="1" height="1" clip-path="url(#logo-0)"/>' +
          '<clipPath id="logo-2"><use href="#logo-1"/></clipPath>',
      ),
    ).not.toEqual([]);
    expect(check(`<clipPath id="logo-0"><circle r="1"/><title>t</title></clipPath>`)).toEqual([]);
  });
});
