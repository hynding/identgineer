import { sanitiseSvgLogo } from "@identgineer/brand";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seeded } from "./seeded";

// The sanitiser writes every number it keeps exactly as it was given, so Chromium reads the
// output's numbers as it read the original's, however it rounds them. This holds it to that where a
// number rewritten in another spelling would show: thousands of documents generated at random, of
// numbers of many places near where the drawing changes (radii that barely fit between an arc's
// ends, ends a hair apart, dashes far below a pixel, a hair's offset under a transform magnifying
// it a million times). Each the sanitiser keeps with nothing reported must draw, as an image,
// exactly as the original, pixel for pixel.

const SIZE = 100;
const DOCUMENTS_PER_FAMILY = 800;
const BATCH = 200;

type Random = () => number;

const pick = <T>(random: Random, choices: readonly T[]): T =>
  choices[Math.floor(random() * choices.length)] as T;

/** A number of 8 to 17 significant digits, as an editor or a script writes one. */
function written(random: Random, value: number): string {
  const text = value.toPrecision(pick(random, [8, 10, 12, 15, 17]));
  return text.includes("e") ? String(Number(value.toFixed(12))) : String(Number(text));
}

const logo = (viewBox: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(viewBox)} ${String(viewBox)}" width="${String(SIZE)}" height="${String(SIZE)}">${body}</svg>`;

/** Arcs whose radii barely fit, whose ends nearly meet, of radii near zero, chained or relative. */
function arc(random: Random): string {
  const box = pick(random, [1, 2, 10, 24, 100, 1000, 5000]);
  const n = (value: number): string => written(random, value);
  const [cx, cy] = [box * (0.3 + 0.4 * random()), box * (0.3 + 0.4 * random())];
  const half = box * (0.05 + 0.3 * random());
  const turn = random() * 2 * Math.PI;
  const flags = `${pick(random, ["0", "1"])} ${pick(random, ["0", "1"])}`;
  const [x1, y1] = [cx - half * Math.cos(turn), cy - half * Math.sin(turn)];
  const [x2, y2] = [cx + half * Math.cos(turn), cy + half * Math.sin(turn)];
  const misfit = (random() * 2 - 1) * 10 ** -(5 + 4 * random());
  const from = `M${n(x1)} ${n(y1)}`;
  const to = `${n(x2)} ${n(y2)}`;
  const kind = pick(random, ["fit", "meet", "zero", "turn", "ratio", "chain", "flip"]);
  let d: string;
  if (kind === "fit") {
    const r = n(half * (1 + misfit / box));
    d = `${from}A${r} ${r} 0 ${flags} ${to}Z`;
  } else if (kind === "meet") {
    const gap = 10 ** -(5 + 3 * random()) * box;
    const r = box * 0.2 * (0.2 + random());
    d = `M${n(cx)} ${n(cy)}A${n(r)} ${n(r * (1 + 0.3 * random()))} ${n(random() * 360)} ${flags} ${n(cx + gap * Math.cos(turn))} ${n(cy + gap * Math.sin(turn))}Z`;
  } else if (kind === "zero") {
    d = `${from}A${n(10 ** -(5.5 + random()))} ${n(half * random())} ${n(random() * 360)} ${flags} ${to}Z`;
  } else if (kind === "turn") {
    const r = half * (1 + random());
    d = `${from}A${n(r)} ${n(r * (1 + misfit))} ${n(random() * 720 - 360)} ${flags} ${to}Z`;
  } else if (kind === "ratio") {
    const r = half * (0.1 + 0.8 * random());
    d = `${from}A${n(r)} ${n(r * (0.3 + random()))} ${n(random() * 360)} ${flags} ${to}Z`;
  } else if (kind === "chain") {
    const relative = random() < 0.5;
    const parts = [from, relative ? "a" : "A"];
    let [x, y] = [x1, y1];
    for (let step = 2 + Math.floor(random() * 20); step > 0; step -= 1) {
      const [angle, length] = [random() * 2 * Math.PI, box * 0.05 * random()];
      const [nx, ny] = [x + length * Math.cos(angle), y + length * Math.sin(angle)];
      const r = n((length / 2) * (1 + (random() < 0.5 ? misfit : random())));
      const ends = relative ? `${n(nx - x)} ${n(ny - y)}` : `${n(nx)} ${n(ny)}`;
      parts.push(
        `${r} ${r} 0 ${pick(random, ["0", "1"])}${pick(random, ["", " "])}${pick(random, ["0", "1"])} ${ends} `,
      );
      [x, y] = [nx, ny];
    }
    d = `${parts.join("")}Z`;
  } else {
    const r = n(half * (1 - Math.abs(misfit)));
    d = `${from}A${r} ${r} ${n(random() * 360)} ${flags} ${to}Z`;
  }
  return logo(
    box,
    `<path d="${d}" fill="#000" stroke="#f00" stroke-width="${String(box / 400)}"/>`,
  );
}

/** Ends that coincide but for a hair, which single precision may or may not tell apart. */
function coincide(random: Random): string {
  const box = pick(random, [1, 10, 100, 1000]);
  const n = (value: number): string => written(random, value);
  const [x, y] = [box * (0.2 + 0.6 * random()), box * (0.1 + 0.2 * random())];
  const hair = box * 10 ** -(6 + 3 * random()) * (random() < 0.5 ? -1 : 1);
  const r = box * (0.2 + 0.2 * random());
  const relative = random() < 0.5;
  const end = relative ? `${n(hair)} 0` : `${n(x + hair)} ${n(y)}`;
  const command = relative ? "a" : "A";
  return logo(
    box,
    `<path d="M${n(x)} ${n(y)}${command}${n(r)} ${n(r * (0.8 + 0.4 * random()))} ${n(random() * 360)} ${pick(random, ["0", "1"])} ${pick(random, ["0", "1"])} ${end}Z" fill="#000"/>`,
  );
}

/** Dash arrays with lengths far below a pixel beside others that are not, and caps that show them. */
function dashes(random: Random): string {
  const n = (value: number): string => written(random, value);
  const tiny = (): string => n(10 ** -(5 + 3 * random()));
  const lengths = [tiny(), n(2 + 20 * random()), random() < 0.5 ? tiny() : n(1 + 10 * random())];
  if (random() < 0.5) lengths.push(n(5 + 10 * random()));
  const cap = pick(random, ["butt", "round", "square"]);
  const [x1, y1, x2, y2] = [10, 10 + 80 * random(), 90, 10 + 80 * random()].map(n);
  return logo(
    100,
    `<path d="M${x1 ?? ""} ${y1 ?? ""}L${x2 ?? ""} ${y2 ?? ""}" stroke="#000" stroke-width="${n(2 + 10 * random())}" stroke-linecap="${cap}" stroke-dasharray="${lengths.join(pick(random, [" ", ",", ", "]))}" stroke-dashoffset="${random() < 0.5 ? tiny() : "0"}"/>`,
  );
}

/** A hair's offset, scale or turn under transforms that magnify it up to a million times. */
function magnified(random: Random): string {
  const n = (value: number): string => written(random, value);
  const hair = (): string => n((random() < 0.5 ? -1 : 1) * 10 ** -(5 + 2 * random()));
  const zoom = 10 ** (2 + 4 * random());
  const shape = 10 / zoom;
  const inner = pick(random, [
    `<rect width="${n(shape * (1 + random()))}" height="${n(shape)}" fill="#f00"/>`,
    `<path d="M${hair()} 0H${n(shape)}V${n(shape)}Z" fill="#f00"/>`,
    `<circle cx="${n(shape / 2)}" cy="${n(shape / 2)}" r="${n(shape * (0.3 + 0.2 * random()))}" fill="#f00"/>`,
    `<polygon points="${hair()},0 ${n(shape)},${hair()} ${n(shape / 2)},${n(shape)}" fill="#f00"/>`,
  ]);
  const nudge = pick(random, [
    `translate(${hair()} ${hair()})`,
    `rotate(${hair()})`,
    `scale(${n(1 + 10 ** -(5 + 2 * random()))})`,
    `matrix(${n(1 + Number(hair()))},${hair()},${hair()},${n(1 + Number(hair()))},${hair()},${hair()})`,
  ]);
  return logo(
    100,
    `<rect width="100" height="100" fill="#00f"/><g transform="translate(${n(10 + 40 * random())} ${n(10 + 40 * random())}) scale(${n(zoom)})"><g transform="${nudge}">${inner}</g></g>`,
  );
}

const FAMILIES: Readonly<Record<string, (random: Random) => string>> = {
  "arcs near where their drawing changes": arc,
  "ends a hair apart": coincide,
  "dashes far below a pixel": dashes,
  "hairs magnified by a transform": magnified,
};

interface Pair {
  readonly original: string;
  readonly output: string;
}

const url = (text: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

/** The originals whose output Chromium draws differently by so much as one channel of one pixel. */
async function differing(page: Page, pairs: readonly Pair[]): Promise<string[]> {
  await page.setContent("<!doctype html><body>");
  const found: string[] = [];
  for (let start = 0; start < pairs.length; start += BATCH) {
    const batch = pairs
      .slice(start, start + BATCH)
      .map(({ original, output }) => ({ original: url(original), output: url(output) }));
    const indices = await page.evaluate(
      async ({ batch, size }) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("no 2D context");
        const pixels = async (source: string): Promise<Uint8ClampedArray> => {
          const image = new Image();
          image.src = source;
          await image.decode();
          context.clearRect(0, 0, size, size);
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, size, size).data;
        };
        const unlike: number[] = [];
        for (const [index, { original, output }] of batch.entries()) {
          const [first, second] = [await pixels(original), await pixels(output)];
          if (first.some((channel, at) => channel !== second[at])) unlike.push(index);
        }
        return unlike;
      },
      { batch, size: SIZE },
    );
    found.push(...indices.map((index) => pairs[start + index]?.original ?? ""));
  }
  return found;
}

test.describe("a logo of numbers written as given", () => {
  for (const [index, [family, generate]] of Object.entries(FAMILIES).entries()) {
    test(`draws as the original, pixel for pixel, for ${family}`, async ({ page }) => {
      const random = seeded(2_026_171 + index);
      const pairs: Pair[] = [];
      for (let run = 0; run < DOCUMENTS_PER_FAMILY; run += 1) {
        const original = generate(random);
        const result = sanitiseSvgLogo(original);
        if (result.ok && result.removed.length === 0) pairs.push({ original, output: result.svg });
      }
      // Most must be kept, or the test would hold the sanitiser to nothing.
      expect(pairs.length).toBeGreaterThan(DOCUMENTS_PER_FAMILY / 2);
      expect(await differing(page, pairs)).toEqual([]);
    });
  }
});
