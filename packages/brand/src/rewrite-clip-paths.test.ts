import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo, sanitiseSvgLogoWithLimits } from "./sanitise-svg-logo.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import type { SvgLogoAccepted } from "./svg-logo-result.ts";
import { findSanitisedSvgProblems } from "./svg-output-check.ts";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ROOT = `<svg ${NS} viewBox="0 0 100 100" width="100" height="100">`;
/** What a rewritten clip path's mask draws its shapes with, inherited by each: opaque, unstroked. */
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
      `<mask id="logo-0" x="2" y="22" width="96" height="56" maskUnits="userSpaceOnUse" mask-type="alpha" ${PAINT}>` +
        TWO_CIRCLES +
        "</mask>" +
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
      '<circle cx="30" cy="50" r="20"/><circle cx="70" cy="50" r="20" fill-rule="evenodd"/>',
    );
  });

  it("leave out what a clip path ignores: shapes not displayed or hidden, by themselves or their use", () => {
    const result = accepted(
      '<rect id="h" width="5" height="5" display="none"/>' +
        `<clipPath id="c">${TWO_CIRCLES}` +
        '<rect width="9" height="9" display="none"/><rect width="9" height="9" visibility="hidden"/>' +
        '<use href="#h"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>',
    );
    const masked = inner(result);
    expect(masked.match(/<circle/g)).toHaveLength(2);
    expect(masked).not.toContain('width="9"');
    expect(masked).not.toContain("<use");
    expect(result.removed.map(({ element, reason }) => [element, reason])).toEqual([
      ["rect", "render-cost"],
      ["rect", "render-cost"],
      ["use", "render-cost"],
      ["clipPath", "rewritten"],
    ]);
  });

  it("empty a clip path holding a use of anything but a shape, which browsers draw differently", () => {
    // Chromium 153 clips to what the group draws; the specification calls it an error. An empty
    // clip path draws less than either.
    const result = accepted(
      '<g id="g"><rect width="5" height="5"/></g>' +
        `<clipPath id="c">${TWO_CIRCLES}<use href="#g"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>`,
    );
    expect(inner(result)).toBe(
      '<g><rect width="5" height="5"/></g><clipPath id="logo-0"/><rect width="100" height="100" clip-path="url(#logo-0)"/>',
    );
    expect(result.removed.map(({ element, reason }) => [element, reason])).toEqual([
      ["circle", "misplaced"],
      ["circle", "misplaced"],
      ["use", "misplaced"],
    ]);
  });

  it("keep a clip child that a use elsewhere draws, as a definition with its id and paint", () => {
    const masked = inner(
      accepted(
        '<clipPath id="c"><rect id="r" width="40" height="40" fill="blue"/><circle cx="60" cy="60" r="20"/></clipPath>' +
          '<rect width="100" height="100" fill="red" clip-path="url(#c)"/><use href="#r" x="50"/>',
      ),
    );
    expect(masked).toBe(
      '<defs><rect id="logo-0" width="40" height="40" fill="blue"/></defs>' +
        `<mask id="logo-1" x="-8" y="-8" width="96" height="96" maskUnits="userSpaceOnUse" mask-type="alpha" ${PAINT}>` +
        '<rect width="40" height="40"/><circle cx="60" cy="60" r="20"/></mask>' +
        '<rect width="100" height="100" fill="red" mask="url(#logo-1)"/><use href="#logo-0" x="50"/>',
    );
  });

  it("keep a use in a clip path that a use elsewhere draws, as a definition with its id", () => {
    const masked = inner(
      accepted(
        '<defs><rect id="r" width="40" height="40"/></defs><clipPath id="c"><use id="u" href="#r" x="5"/><circle cx="60" cy="60" r="20"/></clipPath>' +
          '<rect width="100" height="100" clip-path="url(#c)"/><use href="#u" fill="blue"/>',
      ),
    );
    expect(masked).toContain('<use id="logo-1" href="#logo-0" x="5"/>');
    expect(masked).toContain('<use href="#logo-1" fill="blue"/>');
  });

  it("keep a hidden clip child that a use elsewhere draws", () => {
    const masked = inner(
      accepted(
        '<g visibility="hidden"><clipPath id="c"><rect id="r" width="40" height="40"/></clipPath></g>' +
          '<rect width="100" height="100" clip-path="url(#c)"/><use href="#r" x="50" y="50" visibility="visible"/>',
      ),
    );
    expect(masked).toBe(
      '<g visibility="hidden"><defs><rect id="logo-0" width="40" height="40"/></defs><clipPath id="logo-1"/></g>' +
        '<rect width="100" height="100" clip-path="url(#logo-1)"/><use href="#logo-0" x="50" y="50" visibility="visible"/>',
    );
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

  it("draw a use's target through one bare copy of it, the use kept with its position and transform", () => {
    const masked = inner(
      accepted(
        '<rect id="t" width="10" height="10" transform="scale(2)" fill="red" stroke="blue" stroke-width="40" opacity="0.5"/>' +
          '<clipPath id="c"><use href="#t" x="5" transform="translate(1 1)" fill-opacity="0.2"/><use href="#t" x="50%"/>' +
          '<rect x="60" width="10" height="10"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(masked).toContain(
      '<defs><rect id="logo-0" width="10" height="10" transform="scale(2)"/></defs><mask id="logo-1"',
    );
    expect(masked).toContain(
      '<use href="#logo-0" x="5" transform="translate(1 1)"/><use href="#logo-0" x="50%"/><rect x="60" width="10" height="10"/></mask>',
    );
  });

  it("copy a use's target once however many uses draw it, so the output grows with the input", () => {
    const path = `<path id="p" d="M0 0${"L1 2".repeat(500)}"/>`;
    const input = `${ROOT}<defs>${path}</defs><clipPath id="c">${'<use href="#p"/>'.repeat(200)}</clipPath><rect width="10" height="10" clip-path="url(#c)"/></svg>`;
    const result = accepted(input.slice(ROOT.length, -"</svg>".length));
    expect(result.svg.match(/L1 2/g)?.length).toBe(500);
    expect(result.svg.length).toBeLessThan(input.length * 2);
  });

  it("fill a use's target by its own clip rule, or else by the use's", () => {
    const masked = inner(
      accepted(
        '<path id="a" d="M0 0H9V9Z" clip-rule="evenodd"/><path id="b" d="M0 0H9V9Z"/>' +
          '<clipPath id="c"><use href="#a" clip-rule="nonzero"/><use href="#b" clip-rule="evenodd"/></clipPath>' +
          '<rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(masked).toContain('<path id="logo-0" d="M0 0H9V9Z" fill-rule="evenodd"/>');
    expect(masked).toContain('<path id="logo-1" d="M0 0H9V9Z"/>');
    expect(masked).toContain('<use href="#logo-0"/><use href="#logo-1" fill-rule="evenodd"/>');
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
      '<defs><rect id="logo-2" width="80" height="80" clip-path="url(#logo-0)"/></defs>' +
        `<mask id="logo-3" x="-8" y="-8" width="96" height="96" maskUnits="userSpaceOnUse" mask-type="alpha" ${PAINT}>` +
        '<use href="#logo-2"/></mask>',
    );
  });

  it("keep the region within the numbers a value may hold, the margin giving way first", () => {
    const masked = inner(
      accepted(
        '<clipPath id="c"><rect width="10" height="10"/><rect x="900000" width="10" height="10"/></clipPath>' +
          '<rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(masked).toContain(
      '<mask id="logo-0" x="-90001" y="-90001" width="999999.999999" height="180012"',
    );
    const far = inner(
      accepted(
        '<clipPath id="c"><rect x="-999990" width="10" height="10"/><rect x="999990" width="10" height="10"/></clipPath>' +
          '<rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(far).toContain('x="-999999.999999"');
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
      `<mask id="logo-0" x="7" y="-3" width="36" height="16" maskUnits="userSpaceOnUse" mask-type="alpha" ${PAINT}><g transform="translate(10 0)">` +
        '<rect width="10" height="10"/><rect x="20" width="10" height="10"/></g></mask>',
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
      `<mask id="logo-0" x="-0.1" y="-0.1" width="1.2" height="1.2" maskContentUnits="objectBoundingBox" mask-type="alpha" ${PAINT}>`,
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

  it("move a use with a position, a mask of its own and a clip path into a group that takes the position", () => {
    const masked = inner(
      accepted(
        '<mask id="m"><rect width="300" height="300" fill="#fff"/></mask><rect id="s" width="10" height="10"/>' +
          `<clipPath id="c">${TWO_CIRCLES}</clipPath>` +
          '<use href="#s" x="10%" y="5" transform="scale(2)" mask="url(#m)" clip-path="url(#c)"/>',
      ),
    );
    expect(masked).toContain(
      '<g transform="scale(2) translate(10 5)" mask="url(#logo-2)"><use href="#logo-1" mask="url(#logo-0)"/></g>',
    );
  });

  it("refuse a clip path in the box of what it clips with a transform, which no single mask matches", () => {
    const result = sanitiseSvgLogo(
      `${ROOT}<clipPath id="c" clipPathUnits="objectBoundingBox" transform="translate(0.5 0)">` +
        '<rect width="0.5" height="1"/><rect width="0.5" height="0.5"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/></svg>',
    );
    expect(result.ok || result.errors[0]?.code).toBe("drawing-too-costly");
  });

  it("refuse a clip path in the box of what it clips that is clipped itself", () => {
    const result = sanitiseSvgLogo(
      `${ROOT}<clipPath id="d"><rect width="50" height="50"/></clipPath>` +
        '<clipPath id="c" clipPathUnits="objectBoundingBox" clip-path="url(#d)"><rect width="1" height="1"/></clipPath>' +
        '<rect width="100" height="100" clip-path="url(#c)"/></svg>',
    );
    expect(result.ok || result.errors[0]?.code).toBe("drawing-too-costly");
  });

  it("keep a clip path of one shape in the box of what it clips, transform and all", () => {
    const body =
      '<clipPath id="c" clipPathUnits="objectBoundingBox" transform="translate(0.5 0)"><rect width="0.5" height="1"/></clipPath>' +
      '<rect width="100" height="100" clip-path="url(#c)"/>';
    expect(inner(accepted(body))).toBe(
      body.replaceAll("#c", "#logo-0").replace('id="c"', 'id="logo-0"'),
    );
  });

  it("keep a use's percentage position as it is, in the box of what it clips too", () => {
    expect(
      inner(
        accepted(
          '<defs><rect id="r" width="0.2" height="0.2"/></defs><clipPath id="c" clipPathUnits="objectBoundingBox">' +
            '<use href="#r" x="50%" y="10%"/><circle cx="0.2" cy="0.7" r="0.1"/></clipPath>' +
            '<rect x="10" y="20" width="80" height="60" clip-path="url(#c)"/>',
        ),
      ),
    ).toContain('<use href="#logo-0" x="50%" y="10%"/>');
  });

  it("rewrite a clip path that is clipped itself, keeping that clip around its content", () => {
    expect(
      inner(
        accepted(
          '<clipPath id="d"><rect width="50" height="50"/></clipPath><clipPath id="c" clip-path="url(#d)" transform="translate(5 0)">' +
            '<rect width="100" height="100"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>',
        ),
      ),
    ).toContain(
      `maskUnits="userSpaceOnUse" mask-type="alpha" ${PAINT}><g clip-path="url(#logo-0)"><g transform="translate(5 0)"><rect width="100" height="100"/></g></g></mask>`,
    );
  });

  it("rewrite a clip path whose shape or use is clipped itself, keeping that clip on it", () => {
    const onShape = inner(
      accepted(
        '<clipPath id="d"><rect width="50" height="50"/></clipPath><clipPath id="c"><rect width="100" height="100" clip-path="url(#d)"/></clipPath>' +
          '<rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(onShape).toContain('<rect width="100" height="100" clip-path="url(#logo-0)"/></mask>');
    const onUse = inner(
      accepted(
        '<clipPath id="d"><rect width="50" height="50"/></clipPath><defs><rect id="t" width="100" height="100"/></defs>' +
          '<clipPath id="c"><use href="#t" clip-path="url(#d)"/></clipPath><rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(onUse).toContain('<use href="#logo-1" clip-path="url(#logo-0)"/></mask>');
  });

  it("nest the masks when a clip inside a rewritten clip path is rewritten too", () => {
    const masked = inner(
      accepted(
        `<clipPath id="d">${TWO_CIRCLES}</clipPath><clipPath id="c"><rect width="100" height="100" clip-path="url(#d)"/></clipPath>` +
          '<rect width="100" height="100" clip-path="url(#c)"/>',
      ),
    );
    expect(masked).toContain('<rect width="100" height="100" mask="url(#logo-0)"/></mask>');
    expect(masked).toContain('<rect width="100" height="100" mask="url(#logo-1)"/>');
  });

  it("still drop a mask inside a clip path, which Chromium ignores there", () => {
    const result = accepted(
      '<mask id="m"><rect width="9" height="9" fill="#fff"/></mask><clipPath id="c" mask="url(#m)"><rect width="50" height="50" mask="url(#m)"/></clipPath>' +
        '<rect width="100" height="100" clip-path="url(#c)"/>',
    );
    expect(inner(result)).not.toContain("mask");
    expect(result.removed.map(({ attribute, reason }) => [attribute, reason])).toEqual([
      ["mask", "render-cost"],
      ["mask", "render-cost"],
    ]);
  });

  it("drop clip paths and other definitions nothing refers to, before any rewriting", () => {
    const result = accepted(
      `<defs><path id="p" d="M0 0L1 1"/><linearGradient id="g"/></defs><clipPath id="c">${TWO_CIRCLES}</clipPath>` +
        '<rect width="100" height="100"/>',
    );
    expect(inner(result)).toBe('<defs/><rect width="100" height="100"/>');
    expect(result.removed).toEqual([]);
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

/** The reviewer's amplifier: a path of about `kilobytes` drawn by `uses` uses in one clip path. */
function amplifier(uses: number, kilobytes: number, referenced: boolean): string {
  let data = "M0 0";
  for (let index = 0; data.length < kilobytes * 1024 - 20; index += 1) {
    data += `L${String((index * 7) % 1000)} ${String((index * 13) % 1000)}`;
  }
  const clipped = referenced ? '<rect width="10" height="10" clip-path="url(#c)"/>' : "";
  return `<svg ${NS} viewBox="0 0 1000 1000"><defs><path id="p" d="${data}"/></defs><clipPath id="c">${'<use href="#p"/>'.repeat(uses)}</clipPath>${clipped}</svg>`;
}

describe("work and output bounded by the input", () => {
  it("sanitises 4,000 uses of a 127 KB path in an unreferenced clip path in well under a second", () => {
    const input = amplifier(4000, 127, false);
    const started = performance.now();
    const result = sanitiseSvgLogo(input);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.ok && result.svg.length).toBeLessThan(200);
  });

  it("refuses 2,000 uses of a 100 KB path in a referenced clip path in well under a second", () => {
    const input = amplifier(2000, 100, true);
    const started = performance.now();
    const result = sanitiseSvgLogo(input);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.ok || result.errors[0]?.code).toBe("drawing-too-costly");
  });

  it("refuses an output that would be larger than the input limit, rather than return it", () => {
    const input = `${ROOT}<clipPath id="c">${TWO_CIRCLES}</clipPath><rect width="100" height="100" clip-path="url(#c)"/></svg>`;
    const limits = { ...SVG_LOGO_LIMITS, inputBytes: input.length };
    const result = sanitiseSvgLogoWithLimits(input, undefined, limits);
    expect(result.ok || result.errors[0]?.code).toBe("too-large");
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

  it("refuses a use with no reference", () => {
    expect(findSanitisedSvgProblems(`${ROOT}<use x="1"/></svg>`)).not.toEqual([]);
  });
});
