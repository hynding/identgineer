import { readFileSync } from "node:fs";
import { boundSvgPathData, sanitiseSvgLogo } from "@identgineer/brand";
import { expect, test } from "./fixtures";
import { seeded } from "./seeded";

// The drawing cost and the overdraw count dashes along a path's length and paint within its box,
// so both must hold whatever Chromium makes of the numbers. Chromium reads each in single precision,
// by a reader of its own, and two spellings of one number, or an arc's angle, can come out a hair
// apart; along a radius far below that hair, SVG scales the radii up until the ellipse reaches the
// end, by as much as the hair over the radius. This draws thousands of paths built to sit on those
// edges (radii far below a hair, spellings read apart, huge angles, chains of relative segments,
// segments of no length, reflected control points) and holds the bounds the sanitiser works from
// to Chromium's own length (`getTotalLength`) and box (`getBBox`).

const BRAND_FIXTURES = new URL("../../brand/src/__fixtures__/", import.meta.url);
const PATHS = 4000;

type Random = () => number;

const pick = <T>(random: Random, choices: readonly T[]): T =>
  choices[Math.floor(random() * choices.length)] as T;

/** Another spelling of a plain decimal: Chromium need not read the two as the same number. */
function respelled(random: Random, value: string): string {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  const sign = negative ? "-" : "";
  return pick(random, [
    value,
    `${sign}${digits}e-${String(fraction.length)}`,
    `${sign}.${whole}${fraction}e${String(whole.length)}`,
    `${sign}0${whole}.${fraction}0`.replace(/\.0$/, ".0"),
    `${sign}${whole}${fraction === "" ? "" : `.${fraction}`}00`.replace(/^(-?\d+)00$/, "$1.00"),
  ]);
}

const DECIMALS = [
  "0.3",
  "0.7",
  "1.1",
  "2.3",
  "12.7",
  "0.1",
  "33.3",
  "5.55",
  "9.9",
  "123.45",
  "-4.2",
];
const TINY = ["1e-12", "1e-9", "1e-7", "1e-6", "0.00001", "3e-15", "1e-18"];
const ANGLES = ["0", "30", "45", "90", "180", "720", "1e-7", "3.6e5", ".9e6", "-123456.7"];

/** An arc whose radii, angle and ends sit where a hair in the reading moves the most. */
function arc(random: Random): string {
  const [x, y] = [pick(random, DECIMALS), pick(random, DECIMALS)];
  const small = pick(random, TINY);
  const large = pick(random, ["1", "3", "0.5", "10", "42", ...TINY]);
  const [rx, ry] = random() < 0.5 ? [small, large] : [large, small];
  const flags = `${pick(random, ["0", "1"])} ${pick(random, ["0", "1"])}`;
  const endX = pick(random, [respelled(random, x), respelled(random, x), pick(random, DECIMALS)]);
  const endY = pick(random, [respelled(random, y), pick(random, DECIMALS)]);
  const lead = random() < 0.3 ? `l${pick(random, ["0.6", "0.2", ".25", "0"])} 0` : "";
  return `M${x} ${y}${lead}A${rx} ${ry} ${pick(random, ANGLES)} ${flags} ${endX} ${endY}`;
}

/** A chain of relative segments, of no length or a hair, ending in arcs along a tiny radius. */
function chain(random: Random): string {
  let data = `M${pick(random, DECIMALS)} ${pick(random, DECIMALS)}`;
  for (let step = 1 + Math.floor(random() * 40); step > 0; step -= 1) {
    data += pick(random, [
      `l${pick(random, DECIMALS)} ${pick(random, DECIMALS)}`,
      "h0",
      "v0",
      `h${pick(random, TINY)}`,
      `l${pick(random, DECIMALS)} -${pick(random, DECIMALS)}`,
      `a${pick(random, TINY)} ${pick(random, ["1", "5"])} ${pick(random, ANGLES)} 0 1 ${pick(random, TINY)} ${pick(random, ["0", "1", "2.3"])}`,
      `c0 0 ${pick(random, TINY)} 0 0 0`,
      `s${pick(random, DECIMALS)} 0 0 0`,
      `t${pick(random, TINY)} 0`,
      "z",
    ]);
  }
  return data;
}

/** Curves and lines whose points are one number in two spellings. */
function coincident(random: Random): string {
  const [x, y] = [pick(random, DECIMALS), pick(random, DECIMALS)];
  const again = (): string => `${respelled(random, x)} ${respelled(random, y)}`;
  return pick(random, [
    `M${x} ${y}L${again()}L${again()}Z`,
    `M${x} ${y}C${again()} ${again()} ${again()}S${again()} ${again()}`,
    `M${x} ${y}Q${again()} ${again()}T${again()}T${again()}`,
    `M${x} ${y}A${pick(random, TINY)} ${pick(random, TINY)} ${pick(random, ANGLES)} 1 1 ${again()}`,
  ]);
}

interface Probe {
  readonly data: string;
  readonly length: number;
  readonly box: readonly [number, number, number, number];
}

function probes(): Probe[] {
  const random = seeded(2_026_181);
  const found: Probe[] = [];
  while (found.length < PATHS) {
    const data = pick(random, [arc, arc, chain, coincident])(random);
    const bound = boundSvgPathData(data);
    if (bound === undefined) continue;
    const { minX, minY, maxX, maxY } = bound.box;
    found.push({ data, length: bound.length, box: [minX, minY, maxX, maxY] });
  }
  return found;
}

test.describe("the cost model's bounds of path data", () => {
  test("hold Chromium's length and box, for thousands of paths on the edges of single precision", async ({
    page,
  }) => {
    const list = probes();
    await page.setContent("<!doctype html><body>");
    const outside = await page.evaluate((list) => {
      document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><path id="p"/></svg>';
      const path = document.getElementById("p") as unknown as SVGPathElement;
      const found: string[] = [];
      for (const { data, length, box } of list) {
        path.setAttribute("d", data);
        const drawn = path.getTotalLength();
        const { x, y, width, height } = path.getBBox();
        // Chromium's own points are its readings, a few single-precision steps from the numbers.
        const [minX, minY, maxX, maxY] = box;
        const tolerance = 1e-5 * Math.max(1, ...box.map(Math.abs).filter(Number.isFinite));
        if (
          !(drawn <= length * (1 + 1e-6) + 1e-6) ||
          x < minX - tolerance ||
          y < minY - tolerance ||
          x + width > maxX + tolerance ||
          y + height > maxY + tolerance
        ) {
          found.push(
            `${data}: length ${String(drawn)} over ${String(length)}, box ${String([x, y, x + width, y + height])} outside ${String(box)}`,
          );
        }
      }
      return found;
    }, list);
    expect(outside).toEqual([]);
  });

  // Each draws a dash pattern along hundreds of arcs Chromium scales up a million times or more:
  // left unbounded, a minute of drawing.
  for (const name of [
    "review-arc-float-radius-dash.svg",
    "review-arc-float-radius-dash-relative.svg",
    "review-arc-float-angle-dash.svg",
  ]) {
    test(`refuses ${name}, whose dashes cannot be drawn in time`, () => {
      const result = sanitiseSvgLogo(
        readFileSync(new URL(`hostile-svg/${name}`, BRAND_FIXTURES), "utf8"),
      );
      expect(result.ok || result.errors[0]?.code).toMatch(
        /^(?:drawing-too-costly|overdraw-too-large)$/,
      );
    });
  }
});
