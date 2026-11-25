import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";

// Logos built the way real ones are, at the large end of what each kind holds: detailed emblems,
// traced artwork near the input limit, a wordmark, gradients under clip paths, a pattern of symbols
// placed with use, dashed rings and a Figma export with alpha masks. Each must stay inside both
// budgets with room to spare; the shares below are what each uses, rounded up, so a change to the
// cost model that squeezes real logos shows here first.

const random = seeded(15_004);
const hex = (index: number): string =>
  `#${((index * 0x9e3779 + 0x406080) & 0xffffff).toString(16).padStart(6, "0")}`;
const round = (value: number): string => String(Math.round(value * 100) / 100);

/** A closed blob of `count` cubics around (cx, cy), as tracing or an editor writes one. */
function blob(count: number, cx: number, cy: number, radius: number): string {
  let data = `M${round(cx + radius)} ${round(cy)}`;
  for (let index = 1; index <= count; index += 1) {
    const angle = (index / count) * 2 * Math.PI;
    const reach = radius * (0.8 + 0.2 * random());
    const at = (offset: number): string =>
      `${round(cx + reach * Math.cos(angle - offset))} ${round(cy + reach * Math.sin(angle - offset))}`;
    data += `C${at(0.02)} ${at(0.01)} ${at(0)}`;
  }
  return `${data}Z`;
}

function logo(body: string, definitions = ""): string {
  const defs = definitions === "" ? "" : `<defs>${definitions}</defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}${body}</svg>`;
}

function emblem(paths: number, step: number): string {
  return logo(
    Array.from(
      { length: paths },
      (_, index) =>
        `<path d="${blob(100, 256, 256, 250 - index * step)}" fill="${hex(index)}" stroke="#000" stroke-width="1"/>`,
    ).join(""),
  );
}

function traced(characters: number): string {
  let body = "";
  for (let index = 0; body.length < characters; index += 1) {
    body += `<path d="${blob(200, 50 + random() * 400, 50 + random() * 400, 10 + random() * 40)}" fill="${hex(index)}"/>`;
  }
  return logo(body);
}

function gradientsUnderClips(): string {
  let definitions = "";
  for (let index = 0; index < 10; index += 1) {
    definitions += `<linearGradient id="g${String(index)}" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="0.5" stop-color="#0f0"/><stop offset="1" stop-color="#00f"/></linearGradient>`;
  }
  for (let index = 0; index < 6; index += 1) {
    definitions += `<clipPath id="c${String(index)}"><path d="${blob(30, 256, 256, 200 - index * 20)}"/></clipPath>`;
  }
  let body = "";
  for (let index = 0; index < 6; index += 1) {
    const paths = Array.from(
      { length: 5 },
      (_, inner) =>
        `<path d="${blob(30, 256 + inner * 5, 256, 220)}" fill="url(#g${String((index + inner) % 10)})" opacity="0.8"/>`,
    );
    body += `<g clip-path="url(#c${String(index)})">${paths.join("")}</g>`;
  }
  return logo(body, definitions);
}

function pattern(cubics: number): string {
  const symbol = `<path id="s" d="${blob(cubics, 10, 10, 8)}" fill="#0a7" stroke="#063" stroke-width="0.5"/>`;
  let body = "";
  for (let index = 0; index < 300; index += 1) {
    body += `<use href="#s" x="${String((index % 20) * 25)}" y="${String(Math.floor(index / 20) * 25)}"/>`;
  }
  return logo(body, symbol);
}

function dashedRings(dash: string): string {
  return logo(
    Array.from(
      { length: 10 },
      (_, index) =>
        `<circle cx="256" cy="256" r="${String(240 - index * 20)}" fill="none" stroke="#333" stroke-dasharray="${dash}"/>`,
    ).join(""),
  );
}

function figmaMasks(): string {
  let definitions =
    '<linearGradient id="lg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>';
  let body = "";
  for (let index = 0; index < 8; index += 1) {
    definitions += `<mask id="m${String(index)}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><path d="${blob(16, 256, 256, 200 - index * 10)}" fill="#C4C4C4"/></mask>`;
    body += `<g mask="url(#m${String(index)})"><rect width="512" height="512" fill="${hex(index)}"/><path d="${blob(40, 200, 200, 150)}" fill="url(#lg)" opacity="0.6"/></g>`;
  }
  return logo(body, definitions);
}

/**
 * Outlined lettering as a clip path over a gradient, as Illustrator writes text made into a clip:
 * one shape a letter, each an outline of 60 cubics, every other letter with a counter (a hole)
 * of 20 more, and `clips` such words in one logo.
 */
function textClips(letters: number, clips: number): string {
  let definitions =
    '<linearGradient id="g" x2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient>';
  let body = "";
  const width = 480 / letters;
  for (let clip = 0; clip < clips; clip += 1) {
    const y = 64 + clip * (384 / Math.max(1, clips - 1 || 1));
    const shapes = Array.from({ length: letters }, (_, index) => {
      const x = 16 + width * (index + 0.5);
      const counter = index % 2 === 0 ? blob(20, x, y, width * 0.15) : "";
      return `<path d="${blob(60, x, y, width * 0.45)}${counter}" clip-rule="evenodd"/>`;
    });
    definitions += `<clipPath id="t${String(clip)}">${shapes.join("")}</clipPath>`;
    body += `<g clip-path="url(#t${String(clip)})"><rect width="512" height="512" fill="url(#g)"/></g>`;
  }
  return logo(body, definitions);
}

const FONT =
  "font-size:40px;line-height:1.25;font-family:'Open Sans';-inkscape-font-specification:'Open Sans, Normal'";

/**
 * A wordmark Inkscape converted from text: the group and each glyph keep the font in their style,
 * quoted, and so do the clip path and mask cut from the same lettering.
 */
function inkscapeWordmark(): string {
  const glyphs = Array.from(
    { length: 20 },
    (_, index) =>
      `<path d="${blob(40, 20 + index * 24, 256, 11)}" style="font-weight:bold;font-family:'Open Sans';-inkscape-font-specification:'Open Sans Bold';fill:${hex(index)}"/>`,
  ).join("");
  const cut = `<path d="${blob(40, 256, 256, 200)}" style="${FONT};fill:#ffffff"/>`;
  return logo(
    `<g aria-label="Wordmark" style="${FONT};letter-spacing:0px;fill:#111111;stroke-width:1">${glyphs}</g>` +
      '<rect width="512" height="512" fill="#0a7" clip-path="url(#c)" mask="url(#m)" opacity="0.2"/>',
    `<clipPath id="c" style="${FONT}">${cut}</clipPath><mask id="m" style="${FONT}">${cut}</mask>`,
  );
}

/**
 * A spirograph rosette, as a guilloche is drawn: one thin stroked path of `count` quadratics
 * winding `turns` times round a ring 450 from the centre, each bulging out to `reach`.
 */
function rosette(count: number, turns: number, reach: number): string {
  const at = (radius: number, step: number): string => {
    const angle = (step * 2 * Math.PI * turns) / count;
    return `${(500 + radius * Math.cos(angle)).toFixed(1)} ${(500 + radius * Math.sin(angle)).toFixed(1)}`;
  };
  let data = "M950 500";
  for (let step = 1; step <= count; step += 1) data += `Q${at(reach, step - 0.5)} ${at(450, step)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="512" height="512"><path d="${data}" fill="none" stroke="#000" stroke-width="0.8"/></svg>`;
}

/** A logo drawn in a view box 1,000 square. */
function wide(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="512" height="512">${body}</svg>`;
}

const fixed = (value: number): string => value.toFixed(2);

/** A sunburst of 360 thin lines from the centre, under 8 dashed rings. */
function sunburst(): string {
  const rays = Array.from({ length: 360 }, (_, index) => {
    const angle = (index * Math.PI) / 180;
    return `<line x1="500" y1="500" x2="${fixed(500 + 480 * Math.cos(angle))}" y2="${fixed(500 + 480 * Math.sin(angle))}" stroke="#e90" stroke-width="0.8"/>`;
  });
  const rings = Array.from(
    { length: 8 },
    (_, index) =>
      `<circle cx="500" cy="500" r="${String(60 + index * 55)}" fill="none" stroke="#930" stroke-width="2" stroke-dasharray="4 4"/>`,
  );
  return rays.join("") + rings.join("");
}

/** A guilloche of 180 thin ellipses, each turned a degree from the last. */
function guilloche(): string {
  return Array.from(
    { length: 180 },
    (_, index) =>
      `<ellipse cx="500" cy="500" rx="450" ry="160" transform="rotate(${String(index)} 500 500)" fill="none" stroke="#135" stroke-width="0.4"/>`,
  ).join("");
}

/** A handwritten script: one long stroked path of 800 cubics, round capped and joined. */
function script(): string {
  let data = "M50 500";
  for (let index = 0; index < 800; index += 1) {
    const x = 50 + index * 1.1;
    data += `C${fixed(x + 10)} ${fixed(400 + 80 * Math.sin(index))} ${fixed(x - 5)} ${fixed(600 - 80 * Math.cos(index * 1.3))} ${fixed(x + 1.1)} 500`;
  }
  return `<path d="${data}" fill="none" stroke="#c20" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** 200 slanted lines hatching a circle they are clipped to, under its outline. */
function hatchedCircle(): string {
  const lines = Array.from(
    { length: 200 },
    (_, index) =>
      `<line x1="${String(index * 10 - 1000)}" y1="0" x2="${String(index * 10)}" y2="1000"/>`,
  );
  return `<defs><clipPath id="c"><circle cx="500" cy="500" r="400"/></clipPath></defs><g clip-path="url(#c)" stroke="#000" stroke-width="1.5">${lines.join("")}</g><circle cx="500" cy="500" r="400" fill="none" stroke="#000" stroke-width="6"/>`;
}

/** 60 nested contour lines of a map, each a closed smooth path of 120 quadratics. */
function contours(): string {
  return Array.from({ length: 60 }, (_, ring) => {
    let data = "";
    for (let index = 0; index <= 120; index += 1) {
      const angle = (index * 2 * Math.PI) / 120;
      const radius = 60 + ring * 7 + 20 * Math.sin(5 * angle + ring * 0.3);
      const point = `${fixed(500 + radius * Math.cos(angle))} ${fixed(500 + radius * Math.sin(angle))}`;
      data += index === 0 ? `M${point}` : `T${point}`;
    }
    return `<path d="${data}z" fill="none" stroke="#753" stroke-width="0.8"/>`;
  }).join("");
}

/** One ordinary dashed element added to a logo otherwise solid. */
const DASHED_PARTS = {
  "a dashed border":
    '<rect x="5" y="5" width="990" height="990" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="6 4"/>',
  "a dashed underline":
    '<path d="M100 960H900" stroke="#c00" stroke-width="3" stroke-dasharray="8 6"/>',
  "a dashed ring":
    '<circle cx="500" cy="500" r="495" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="6 4"/>',
  "a dotted ring":
    '<circle cx="500" cy="500" r="495" fill="none" stroke="#999" stroke-width="3" stroke-dasharray="0 6" stroke-linecap="round"/>',
} as const;

/** Each logo with the most of each budget, in percent, it may use. */
const REALISTIC: readonly (readonly [string, string, number, number])[] = [
  ["an emblem of 4,000 cubics, filled and stroked", emblem(40, 6), 21, 9],
  ["an emblem of 8,000 cubics, filled and stroked", emblem(80, 3), 42, 17],
  ["traced artwork of 470 KB", traced(470_000), 61, 1],
  [
    "a wordmark of 20 glyphs",
    logo(
      Array.from(
        { length: 20 },
        (_, index) => `<path d="${blob(40, 20 + index * 24, 256, 11)}" fill="#111"/>`,
      ).join(""),
    ),
    5,
    1,
  ],
  ["10 gradients under 6 clip paths", gradientsUnderClips(), 8, 60],
  ["300 uses of a 20-cubic symbol", pattern(20), 36, 2],
  ["300 uses of a 60-cubic symbol", pattern(60), 96, 3],
  ["dashed rings", dashedRings("1 2"), 17, 1],
  ["finely dashed rings", dashedRings("0.25 0.5"), 64, 9],
  ["a Figma export with 8 alpha masks", figmaMasks(), 4, 60],
  ["a wordmark of 8 outlined letters clipping a gradient", textClips(8, 1), 4, 8],
  ["four such wordmarks in one logo", textClips(8, 4), 13, 31],
  ["an Inkscape wordmark of 20 glyphs converted from text", inkscapeWordmark(), 10, 15],
  ["a rosette of 1,500 quadratics in 11 turns", rosette(1500, 11, 600), 5, 22],
  ["a rosette of 2,000 quadratics in 7 turns", rosette(2000, 7, 600), 7, 36],
  ["a rosette of 2,000 quadratics in 37 turns", rosette(2000, 37, 600), 7, 38],
  // A dash array costs only the shapes it reaches: one dashed element leaves the rest solid.
  ["a sunburst of 360 lines under 8 dashed rings", wide(sunburst()), 15, 3],
  [
    "a script of 800 cubics with a dashed border",
    wide(script() + DASHED_PARTS["a dashed border"]),
    5,
    11,
  ],
  [
    "a script of 800 cubics with a dashed underline",
    wide(script() + DASHED_PARTS["a dashed underline"]),
    5,
    11,
  ],
  [
    "a script of 800 cubics with a dashed ring",
    wide(script() + DASHED_PARTS["a dashed ring"]),
    6,
    11,
  ],
  [
    "a script of 800 cubics with a dotted ring",
    wide(script() + DASHED_PARTS["a dotted ring"]),
    7,
    11,
  ],
  [
    "a circle hatched by 200 lines with a dashed border",
    wide(hatchedCircle() + DASHED_PARTS["a dashed border"]),
    4,
    4,
  ],
  [
    "a circle hatched by 200 lines with a dashed underline",
    wide(hatchedCircle() + DASHED_PARTS["a dashed underline"]),
    4,
    4,
  ],
  [
    "a circle hatched by 200 lines with a dashed ring",
    wide(hatchedCircle() + DASHED_PARTS["a dashed ring"]),
    6,
    5,
  ],
  [
    "a circle hatched by 200 lines with a dotted ring",
    wide(hatchedCircle() + DASHED_PARTS["a dotted ring"]),
    7,
    5,
  ],
  [
    "a guilloche of 180 ellipses with a dashed border",
    wide(guilloche() + DASHED_PARTS["a dashed border"]),
    7,
    25,
  ],
  [
    "a guilloche of 180 ellipses with a dashed underline",
    wide(guilloche() + DASHED_PARTS["a dashed underline"]),
    7,
    25,
  ],
  [
    "a guilloche of 180 ellipses with a dashed ring",
    wide(guilloche() + DASHED_PARTS["a dashed ring"]),
    9,
    25,
  ],
  [
    "a guilloche of 180 ellipses with a dotted ring",
    wide(guilloche() + DASHED_PARTS["a dotted ring"]),
    10,
    25,
  ],
  ["60 contour lines with a dotted ring", wide(contours() + DASHED_PARTS["a dotted ring"]), 26, 7],
];

describe("realistic logos", () => {
  it.each(REALISTIC)(
    "accepts %s within both budgets",
    (_label, svg, costPercent, overdrawPercent) => {
      expect(svg.length).toBeLessThanOrEqual(SVG_LOGO_LIMITS.inputBytes);
      const result = sanitiseSvgLogo(svg);
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      expect(result.drawingCost).toBeLessThanOrEqual(
        (SVG_LOGO_LIMITS.drawingCost * costPercent) / 100,
      );
      expect(result.overdraw).toBeLessThanOrEqual(
        (SVG_LOGO_LIMITS.overdraw * overdrawPercent) / 100,
      );
    },
  );
});

describe("a wordmark Inkscape converted from text", () => {
  it("keeps every glyph drawn, dropping only the font its styles still name", () => {
    const result = sanitiseSvgLogo(inkscapeWordmark());
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.svg).not.toContain('display="none"');
    expect(result.svg.match(/<path /g)).toHaveLength(22);
    expect(result.svg).toContain('<g fill="#111111" stroke-width="1">');
    expect(new Set(result.removed.map(({ property }) => property ?? "none"))).toEqual(
      new Set([
        "font-size",
        "line-height",
        "font-family",
        "-inkscape-font-specification",
        "font-weight",
        "letter-spacing",
        "none",
      ]),
    );
  });
});
