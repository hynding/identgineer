import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import type { SvgLogoResult } from "./svg-logo-result.ts";

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="#00f"/>${body}</svg>`;

function outcome(result: SvgLogoResult): string {
  return result.ok ? "accept" : (result.errors[0]?.code ?? "none");
}

// Six decimals keep a number to within half a millionth. Where a transform magnifies that past half
// a device pixel at the largest size measured (4000 device pixels across the view box), the
// rounding shows, so the logo is refused; a number rounding did not change is never in question.
describe("a number rounding changed, as its transforms magnify it", () => {
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
      "a gradient's coordinate",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0.0000004" x2="0.00001"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#0f0"/></linearGradient><g transform="scale(999999)"><rect width="0.00001" height="0.00001" fill="url(#g)"/></g>',
    ],
    [
      "relative path data, each rounding carried on by the next",
      `<g transform="scale(999)"><path d="m0 0${" h0.0000004".repeat(50)}v0.1h-0.00002z" fill="#f00"/></g>`,
    ],
    [
      "a dash length, repeated along the stroke",
      '<path d="M0 50H100" stroke="#f00" stroke-width="0.001" stroke-dasharray="0.0015004 0.0015004"/>',
    ],
    [
      "a stroke width rounded to nothing",
      '<g transform="scale(999999)"><path d="M0 0H0.0001" stroke="#f00" stroke-width="0.0000004"/></g>',
    ],
    [
      "a stop's offset, along a long gradient",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x2="999999"><stop offset="0.5000004" stop-color="#f00"/><stop offset="0.5000004" stop-color="#0f0"/></linearGradient><rect width="100" height="100" fill="url(#g)"/>',
    ],
    [
      "a gradient's vector rounded to a point, which paints its last colour",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="50" x2="50.0000003"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#f00"/></linearGradient><rect width="100" height="100" fill="url(#g)"/>',
    ],
    [
      "a gradient's radius rounded to nothing",
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
  ])("refuses %s, magnified past half a device pixel", (_, body) => {
    expect(outcome(sanitiseSvgLogo(svg(body)))).toBe("unsupported-feature");
  });

  it.each([
    [
      "exact numbers under the same magnification",
      '<g transform="scale(999999)"><g transform="translate(0.000001 0) scale(0.000001)"><rect width="10" height="10" fill="#f00"/></g></g>',
    ],
    [
      "a rounded number magnified less than a million times a device pixel",
      '<g transform="scale(10)"><path d="M0.0000004 0H5.1234567V5Z" fill="#f00"/></g>',
    ],
    [
      "a matrix as Inkscape writes one",
      '<g transform="matrix(1.0583333,0,0,1.0583333,-0.52916667,-0.52916667)"><rect width="10.583333" height="3.96875" fill="#f00"/></g>',
    ],
    [
      "a repeating gradient as an editor writes one",
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="10.1234567" x2="20.7654321" spreadMethod="reflect"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f00"/></linearGradient><rect width="100" height="100" fill="url(#g)"/>',
    ],
  ])("keeps %s", (_, body) => {
    expect(outcome(sanitiseSvgLogo(svg(body)))).toBe("accept");
  });
});

/** The matrix `[a, b, c, d, e, f]` of one transform function, from its numbers. */
function functionMatrix(name: string, values: readonly number[]): number[] {
  const [p = 0, q = 0] = values;
  const radians = (p * Math.PI) / 180;
  if (name === "translate") return [1, 0, 0, 1, p, q];
  if (name === "scale") return [p, 0, 0, values.length > 1 ? q : p, 0, 0];
  return [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
}

function multiply(m: readonly number[], n: readonly number[]): number[] {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = m;
  const [g = 0, h = 0, i = 0, j = 0, k = 0, l = 0] = n;
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

/** Every transform list in a document, in order, composed. */
function composed(document: string): number[] {
  let matrix = [1, 0, 0, 1, 0, 0];
  for (const [, list = ""] of document.matchAll(/transform="([^"]*)"/g)) {
    for (const [, name = "", values = ""] of list.matchAll(/(\w+)\(([^)]*)\)/g)) {
      matrix = multiply(matrix, functionMatrix(name, values.split(/[\s,]+/).map(Number)));
    }
  }
  return matrix;
}

/** The corners of the one red rectangle, as drawn in device pixels at 4000 across. */
function corners(document: string): (readonly [number, number])[] {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = composed(document);
  const attribute = (name: string): number =>
    Number(
      new RegExp(`<rect ${name}="([^"]*)"`).exec(document.slice(document.indexOf("<g")))?.[1] ?? 0,
    );
  const [x, width] = [
    attribute("x"),
    Number(/ width="([^"]*)" height="[^"]*" fill="#f/.exec(document)?.[1]),
  ];
  return [
    [x, 0],
    [x + width, 0],
    [x, width],
    [x + width, width],
  ].map(([px = 0, py = 0]) => [40 * (a * px + c * py + e), 40 * (b * px + d * py + f)] as const);
}

describe("a magnified rounding, at random", () => {
  it("is refused wherever it moves what shows by more than half a device pixel, and kept where nothing rounds", () => {
    const random = seeded(2_026_151);
    const decimals = (value: number, places: number): string => value.toFixed(places);
    let checked = 0;
    for (let run = 0; run < 3000; run += 1) {
      const places = random() < 0.4 ? 6 : 8;
      const functions: string[] = [];
      for (let index = 0; index < 1 + Math.floor(random() * 5); index += 1) {
        const kind = Math.floor(random() * 3);
        if (kind === 0) {
          const exponent = Math.floor(random() * 12) - 6;
          functions.push(
            `scale(${decimals(Math.min(999999, (1 + random() * 8) * 10 ** exponent), places)})`,
          );
        } else if (kind === 1) {
          functions.push(
            `translate(${decimals(random() * 20 - 10, places)} ${decimals(random() * 2 - 1, places)})`,
          );
        } else {
          functions.push(`rotate(${decimals(random() * 90, places)})`);
        }
      }
      const groups = functions.map((item) => `<g transform="${item}">`).join("");
      const width = decimals(random() * 50, places);
      const input = svg(
        `${groups}<rect x="${decimals(random() * 10, places)}" width="${width}" height="${width}" fill="#f00"/>${"</g>".repeat(functions.length)}`,
      );
      const result = sanitiseSvgLogo(input);
      if (places === 6) expect(outcome(result)).not.toBe("unsupported-feature");
      if (!result.ok) continue;
      checked += 1;
      const before = corners(input);
      const after = corners(result.svg);
      before.forEach(([x, y], index) => {
        const [shownX = 0, shownY = 0] = after[index] ?? [];
        const visible = (u: number, v: number): boolean =>
          u >= 0 && u <= 4000 && v >= 0 && v <= 4000;
        if (!visible(x, y) && !visible(shownX, shownY)) return;
        expect(Math.hypot(shownX - x, shownY - y)).toBeLessThanOrEqual(0.5 + 1e-6);
      });
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
