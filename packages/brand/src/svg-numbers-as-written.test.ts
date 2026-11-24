import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import type { SvgLogoResult } from "./svg-logo-result.ts";

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="#00f"/>${body}</svg>`;

const drawing = (viewBox: string, size: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${size}>${body}</svg>`;

function outcome(result: SvgLogoResult): string {
  return result.ok ? "accept" : (result.errors[0]?.code ?? "none");
}

/** Every value of a name that takes numbers, as it stands in a document, in order. */
function numbered(document: string): string[] {
  const names =
    "d|points|transform|gradientTransform|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|fx|fy|fr|offset|stroke-width|stroke-dasharray|stroke-dashoffset";
  return [...document.matchAll(new RegExp(` (?:${names})="([^"]*)"`, "g"))].map(
    ([, value = ""]) => value,
  );
}

/** Holds a document to being kept with nothing reported, each number written as it was given. */
function expectWrittenAsGiven(input: string): void {
  const result = sanitiseSvgLogo(input);
  if (!result.ok) throw new Error(`${input}: refused as ${outcome(result)}`);
  expect(result.removed, input).toEqual([]);
  expect(numbered(result.svg), input).toEqual(numbered(input));
}

// Chromium reads the numbers of a logo in single precision, by readers of its own (one for path
// data and lists, one for lengths), whose results need not be the nearest single-precision number:
// a number rewritten in another spelling, however close, can be read as another number, and where
// ends meet, radii barely fit or a transform magnifies, that shows. So every number the sanitiser
// keeps is written exactly as it was given, and Chromium reads the output's numbers as it read the
// original's, however it rounds them.
describe("numbers a transform magnifies", () => {
  it.each([
    [
      "a translation inside a magnifying chain",
      '<g transform="scale(999999)"><g transform="scale(99999)"><g transform="translate(0.0000004 0)"><g transform="scale(0.00001) scale(0.000001)"><rect width="100" height="100" fill="#f00"/></g></g></g></g>',
    ],
    [
      "a scale under a magnifying one",
      '<g transform="scale(999999)"><g transform="scale(0.0000014)"><rect width="10" height="10" fill="#f00"/></g></g>',
    ],
    [
      "a rotation under a scale magnifying one axis",
      '<g transform="scale(999999 1) rotate(0.0000004)"><rect width="100" height="100" fill="#f00"/></g>',
    ],
    [
      "a coordinate of path data",
      '<g transform="scale(999999)"><path d="M0.0000004 0H0.00001V0.00001Z" fill="#f00"/></g>',
    ],
    [
      "a width of a rectangle",
      '<g transform="scale(999999)"><rect width="0.0000104" height="0.00001" fill="#f00"/></g>',
    ],
    [
      "a use's offset",
      '<defs><rect id="r" width="0.00001" height="0.00001" fill="#f00"/></defs><g transform="scale(999999)"><use href="#r" x="0.0000004"/></g>',
    ],
    [
      "a clip path's transform",
      '<clipPath id="c" transform="translate(0.0000004 0)"><rect width="0.00001" height="0.00001"/></clipPath><g transform="scale(999999)"><rect width="0.00001" height="0.00001" fill="#f00" clip-path="url(#c)"/></g>',
    ],
    [
      "a mask's region",
      '<mask id="m" maskUnits="userSpaceOnUse" x="0.0000004" y="0" width="0.00001" height="0.00001"><rect width="0.00001" height="0.00001" fill="#fff"/></mask><g transform="scale(999999)"><rect width="0.00001" height="0.00001" fill="#f00" mask="url(#m)"/></g>',
    ],
    [
      "a gradient's transform",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x2="0.00001" gradientTransform="translate(0.0000004)"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#0f0"/></linearGradient><g transform="scale(999999)"><rect width="0.00001" height="0.00001" fill="url(#g)"/></g>',
    ],
    [
      "relative path data",
      `<g transform="scale(999)"><path d="m0 0${" h0.0000004".repeat(50)}v0.1h-0.00002z" fill="#f00"/></g>`,
    ],
    [
      "a stroke width far below a pixel",
      '<g transform="scale(999999)"><path d="M0 0H0.0001" stroke="#f00" stroke-width="0.0000004"/></g>',
    ],
    [
      "a stop's offset, along a long gradient",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x2="999999"><stop offset="0.5000004" stop-color="#f00"/><stop offset="0.5000004" stop-color="#0f0"/></linearGradient><rect width="100" height="100" fill="url(#g)"/>',
    ],
    [
      "a gradient's vector a hair long",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="50" x2="50.0000003"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#f00"/></linearGradient><rect width="100" height="100" fill="url(#g)"/>',
    ],
    [
      "a gradient's radius a hair long",
      '<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="0.0000003"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#f00"/></radialGradient><rect width="100" height="100" fill="url(#g)"/>',
    ],
    [
      "a repeating gradient's vector, repeat after repeat",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x2="0.0010004" spreadMethod="repeat"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f00"/></linearGradient><rect width="100" height="100" fill="url(#g)"/>',
    ],
    [
      "an arc's ratio, scaled up to the arc's size",
      '<g transform="scale(999)"><path d="M0 0A0.1 0.3000001 0 0 1 100 0Z" fill="#f00"/></g>',
    ],
    [
      "a matrix as Inkscape writes one",
      '<g transform="matrix(1.0583333,0,0,1.0583333,-0.52916667,-0.52916667)"><rect width="10.583333" height="3.96875" fill="#f00"/></g>',
    ],
  ])("keeps %s, each number as it was given", (_, body) => {
    expectWrittenAsGiven(svg(body));
  });
});

// Where an arc's radii barely fit between its ends, its centre lies the square root of the misfit
// away; where its ends meet, it is drawn as nothing. Chromium decides both in single precision, so
// the arc is written as given and Chromium decides alike for the original and the output.
describe("an arc, written as it was given", () => {
  it.each([
    [
      "radii that barely fit",
      drawing(
        "0 0 1 1",
        'width="100" height="100"',
        '<path fill="red" d="M0 0.9A0.5000004 0.5000004 0 0 1 1 0.9Z"/>',
      ),
    ],
    [
      "an end a hair short of where the radii fit exactly",
      drawing(
        "0 0 1 1",
        'width="100" height="100"',
        '<path fill="red" d="M0 0.9A0.5 0.5 0 0 1 0.9999996 0.9Z"/>',
      ),
    ],
    [
      "radii that barely fit, magnified",
      drawing(
        "0 0 1 1",
        'width="100" height="100"',
        '<path fill="red" d="M0 0.002A0.0016664 0.0016664 0 0 1 0.003332 0.002Z" transform="scale(300)"/>',
      ),
    ],
    [
      "ends a hair apart",
      drawing(
        "0 0 100 100",
        'width="100" height="100"',
        '<path fill="red" d="M10 50A40 40 0 1 0 10.0000004 50Z"/>',
      ),
    ],
    [
      "ends Chromium reads in the other order",
      drawing(
        "0 0 1 1",
        'width="100" height="100"',
        '<path fill="red" d="M0.5000004999 0.1A0.4 0.4 0 1 0 0.5000005001 0.1Z"/>',
      ),
    ],
    [
      "a half ellipse as Inkscape writes it",
      drawing(
        "0 0 20 10",
        'width="20mm" height="10mm"',
        '<path fill="#26a269" d="m 2.6458333,5.2916667 a 0.26458333,0.13229167 0 0 1 0.52916667,0 0.26458333,0.13229167 0 0 1 -0.52916667,0 z"/>',
      ),
    ],
  ])("keeps %s", (_, input) => {
    expectWrittenAsGiven(input);
  });

  it("keeps circles and ellipses written as two half arcs, as Inkscape writes them, as given", () => {
    const random = seeded(2_026_161);
    const significant = (value: number): string => String(Number(value.toPrecision(8)));
    for (let run = 0; run < 2000; run += 1) {
      const size = 0.1 * 10 ** (random() * 4);
      const rx = significant(size * (0.2 + random()));
      const ry = significant(size * (0.2 + random()));
      const side = 2.5 * Math.max(Number(rx), Number(ry)) * (1 + random() * 3);
      const [x, y] = [significant(side / 2 - Number(rx)), significant(side / 2)];
      const across = significant(2 * Number(rx));
      const unit = random() < 0.5 ? "mm" : "";
      expectWrittenAsGiven(
        drawing(
          `0 0 ${significant(side)} ${significant(side)}`,
          `width="100${unit}" height="100${unit}"`,
          `<path d="m ${x},${y} a ${rx},${ry} 0 0 1 ${across},0 ${rx},${ry} 0 0 1 -${across},0 z"/>`,
        ),
      );
    }
  });

  it("keeps arcs of any misfit, flags and turn as given, at random", () => {
    const random = seeded(2_026_162);
    for (let run = 0; run < 1500; run += 1) {
      const [x1, y1, x2, y2] = [0, 0, 0, 0].map(() => 0.1 + random() * 0.8);
      const half = Math.hypot((x2 ?? 0) - (x1 ?? 0), (y2 ?? 0) - (y1 ?? 0)) / 2;
      const misfit = (random() < 0.5 ? -1 : 1) * 10 ** -(2 + random() * 7);
      const rx = half * (1 + misfit);
      const ry = random() < 0.5 ? rx : rx * (0.5 + random());
      const places = 6 + Math.floor(random() * 6);
      const [mx, my, ...arc] = [
        x1,
        y1,
        rx,
        ry,
        random() < 0.5 ? 0 : random() * 180,
        random() < 0.5 ? 0 : 1,
        random() < 0.5 ? 0 : 1,
        x2,
        y2,
      ].map((value) => String(Number((value ?? 0).toFixed(places))));
      expectWrittenAsGiven(
        drawing(
          "0 0 1 1",
          'width="100" height="100"',
          `<path fill="red" d="M${mx ?? ""} ${my ?? ""}A${arc.join(" ")}Z"/>`,
        ),
      );
    }
  });
});

describe("a dash array, written as it was given", () => {
  it.each([
    [
      "lengths far below a pixel, but for one",
      '<path d="M0 50h100" stroke="red" stroke-width="20" stroke-dasharray="0.0000004 0.0000004 10 0"/>',
    ],
    [
      "a dash a hair long with square caps, drawn in the direction of its path",
      '<path d="M10 50L90 60" stroke="#000" stroke-width="20" stroke-linecap="square" stroke-dasharray="0.0000004 10"/>',
    ],
    [
      "an even list of many places",
      '<path d="M0 50H100" stroke="#f00" stroke-width="0.001" stroke-dasharray="0.0040004 0.0040004"/>',
    ],
  ])("keeps %s", (_, body) => {
    expectWrittenAsGiven(svg(body));
  });

  // Dashes far below a pixel, all of them, are as many as the stroke is long over their length:
  // the cost is reckoned on that reading, the costlier, whatever Chromium makes of them.
  it("refuses dashes all far below a pixel as too costly to draw", () => {
    expect(
      outcome(
        sanitiseSvgLogo(
          svg('<path d="M0 50h100" stroke="red" stroke-width="20" stroke-dasharray="0.0000004"/>'),
        ),
      ),
    ).toMatch(/^(?:drawing-too-costly|overdraw-too-large)$/);
  });

  // Chromium takes a negative length as an error and ignores the declaration, as for any other.
  it.each([
    ["a dash length", 'stroke-dasharray="-0.0000004 5"', "stroke-dasharray"],
    ["a stroke width", 'stroke-width="-0.0000004"', "stroke-width"],
    ["a width", 'width="-0.0000004"', "width"],
  ])("drops %s just below zero", (_, attribute, name) => {
    const result = sanitiseSvgLogo(svg(`<rect height="10" ${attribute} stroke="red"/>`));
    expect(result.ok && result.removed).toContainEqual(
      expect.objectContaining({ attribute: name, reason: "invalid-value" }),
    );
  });
});
