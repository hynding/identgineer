import { sanitiseSvgLogo } from "@identgineer/brand";
// The base test, not the strict fixture: Chromium logs each value it rejects, as it should here.
import { expect, test, type Page } from "@playwright/test";

// The sanitiser keeps a value only in a form it has checked Chromium reads the same way, and
// drops anything else. This test holds it to that on the keep side, with spellings no list would
// think of: every attribute and style property the allowlist keeps is written with a valid value in
// a probe where the value shows, and the value is mutated at random (white space of each kind,
// commas, case, quotes, comments, escapes, exponents, signs, units, trailing junk, nothing at all).
// Wherever the sanitiser keeps a mutated spelling, with nothing reported, Chromium must draw the
// output exactly as it draws the original, colour for colour, both as an image and as a document
// of its own (where references resolve as they do inline). The size of the run is set by
// IDG_CONFORMANCE_SPELLINGS (spellings per value, 6 by default; a few hundred locally).

const SPELLINGS_PER_VALUE = Number(process.env.IDG_CONFORMANCE_SPELLINGS ?? "6");
const CELL = 120;
const BATCH = 24;

const svg = (body: string, root = ""): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"${root}>${body}</svg>`;

const GRADIENT =
  '<linearGradient id="g" x2="1"><stop offset="0" stop-color="#0f0"/><stop offset="1" stop-color="#00f"/></linearGradient>';

interface Place {
  readonly name: string;
  readonly values: readonly string[];
  /** The probe with the attribute written as given, ` name="value"` or ` style="…"`. */
  readonly probe: (attribute: string) => string;
  /** Whether a `style` declaration may set it too. */
  readonly property?: boolean;
}

const OPACITIES = ["0.5", "50%", "0", ".25", "1"];
const LENGTHS = ["20", "20px", "20%", "5mm", "2e1", "15.5"];
const SIGNED = [...LENGTHS, "-20"];
const COLOURS = ["#f00", "#F0F", "red", "rgb(255,0,0)", "rgb(0 128 255)", "rgb(100%, 50%, 0%)"];

const shape = (attribute: string): string =>
  svg(
    `${GRADIENT}<rect x="10" y="10" width="80" height="80" fill="#f00" stroke="#00f" stroke-width="10" color="#0aa"${attribute}/>`,
  );

/** A shape with the attribute under test written in place of its default. */
function geometry(
  element: string,
  defaults: Readonly<Record<string, string>>,
  names: readonly string[],
): Place[] {
  return names.map((name) => ({
    name: `${element} ${name}`,
    values: ["width", "height", "r", "rx", "ry"].includes(name) ? LENGTHS : SIGNED,
    probe: (attribute: string) => {
      const others = Object.entries(defaults)
        .filter(([other]) => other !== name)
        .map(([other, value]) => ` ${other}="${value}"`)
        .join("");
      return svg(`<${element}${others} fill="#f00"${attribute}/>`);
    },
  }));
}

const PLACES: readonly Place[] = [
  {
    name: "fill",
    values: [...COLOURS, "url(#g)", "none", "currentColor"],
    probe: shape,
    property: true,
  },
  {
    name: "stroke",
    values: [...COLOURS, "url(#g)", "none", "currentColor"],
    probe: shape,
    property: true,
  },
  {
    name: "color",
    values: COLOURS,
    probe: (a) => svg(`<g${a}><rect width="100" height="100" fill="currentColor"/></g>`),
    property: true,
  },
  { name: "fill-opacity", values: OPACITIES, probe: shape, property: true },
  { name: "stroke-opacity", values: OPACITIES, probe: shape, property: true },
  { name: "opacity", values: OPACITIES, probe: shape, property: true },
  { name: "stroke-width", values: ["5", "5px", "5%", "2mm", "0"], probe: shape, property: true },
  {
    name: "fill-rule",
    values: ["evenodd", "nonzero"],
    probe: (a) => svg(`<path d="M10 10H90V90H10ZM30 30H70V70H30Z" fill="#f00"${a}/>`),
    property: true,
  },
  {
    name: "clip-rule",
    values: ["evenodd", "nonzero"],
    probe: (a) =>
      svg(
        `<clipPath id="c"><path d="M10 10H90V90H10ZM30 30H70V70H30Z"${a}/></clipPath><rect width="100" height="100" fill="#f00" clip-path="url(#c)"/>`,
      ),
    property: true,
  },
  {
    name: "stroke-linecap",
    values: ["round", "square", "butt"],
    probe: (a) => svg(`<path d="M30 50H70" stroke="#f00" stroke-width="30"${a}/>`),
    property: true,
  },
  {
    name: "stroke-linejoin",
    values: ["round", "bevel", "miter"],
    probe: (a) =>
      svg(`<path d="M20 80L50 20L80 80" fill="none" stroke="#f00" stroke-width="15"${a}/>`),
    property: true,
  },
  {
    name: "stroke-miterlimit",
    values: ["1", "10", "4.5"],
    probe: (a) =>
      svg(`<path d="M30 90L50 30L70 90" fill="none" stroke="#f00" stroke-width="10"${a}/>`),
    property: true,
  },
  {
    name: "stroke-dasharray",
    values: ["10 5", "10,5", "5", "1mm 2pt", "none"],
    probe: (a) => svg(`<path d="M0 50H100" stroke="#f00" stroke-width="40"${a}/>`),
    property: true,
  },
  {
    name: "stroke-dashoffset",
    values: ["5", "-5", "2mm"],
    probe: (a) =>
      svg(`<path d="M0 50H100" stroke="#f00" stroke-width="40" stroke-dasharray="20"${a}/>`),
    property: true,
  },
  {
    name: "paint-order",
    values: ["stroke", "normal", "fill stroke markers", "markers stroke"],
    probe: (a) =>
      svg(
        `<rect x="20" y="20" width="60" height="60" fill="#f00" stroke="#00f" stroke-width="20"${a}/>`,
      ),
    property: true,
  },
  { name: "display", values: ["none", "inline"], probe: shape, property: true },
  { name: "visibility", values: ["hidden", "visible", "collapse"], probe: shape, property: true },
  {
    name: "shape-rendering",
    values: ["crispEdges", "auto", "optimizeSpeed", "geometricPrecision"],
    probe: (a) => svg(`<path d="M0 0L100 37L0 100Z" fill="#f00"${a}/>`),
    property: true,
  },
  {
    name: "clip-path",
    values: ["url(#c)", "none", "url('#c')", 'url("#c")', "url( #c )"],
    probe: (a) =>
      svg(
        `<clipPath id="c"><circle cx="50" cy="50" r="30"/></clipPath><rect width="100" height="100" fill="#f00"${a}/>`,
      ),
    property: true,
  },
  {
    name: "mask",
    values: ["url(#m)", "none", "url('#m')"],
    probe: (a) =>
      svg(
        `<mask id="m"><circle cx="50" cy="50" r="30" fill="#fff"/></mask><rect width="100" height="100" fill="#f00"${a}/>`,
      ),
    property: true,
  },
  {
    name: "mask-type",
    values: ["alpha", "luminance"],
    probe: (a) =>
      svg(
        `<mask id="m"${a}><circle cx="50" cy="50" r="30" fill="#00f"/></mask><rect width="100" height="100" fill="#f00" mask="url(#m)"/>`,
      ),
    property: true,
  },
  {
    name: "stop-color",
    values: COLOURS,
    probe: (a) =>
      svg(
        `<linearGradient id="h"><stop offset="0"${a}/><stop offset="1" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#h)"/>`,
      ),
    property: true,
  },
  {
    name: "stop-opacity",
    values: OPACITIES,
    probe: (a) =>
      svg(
        `<linearGradient id="h"><stop offset="0" stop-color="#f00"${a}/><stop offset="1" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#h)"/>`,
      ),
    property: true,
  },
  {
    name: "offset",
    values: ["0.5", "50%", "0", "1", ".25"],
    probe: (a) =>
      svg(
        `<linearGradient id="h"><stop stop-color="#f00"${a}/><stop offset="1" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#h)"/>`,
      ),
  },
  ...geometry("rect", { x: "10", y: "10", width: "60", height: "60", rx: "5" }, [
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
  ]),
  ...geometry("circle", { cx: "50", cy: "50", r: "30" }, ["cx", "cy", "r"]),
  ...geometry("ellipse", { cx: "50", cy: "50", rx: "30", ry: "20" }, ["rx", "ry"]),
  ...geometry(
    "line",
    { x1: "10", y1: "10", x2: "90", y2: "90", stroke: "#f00", "stroke-width": "10" },
    ["x1", "y1", "x2", "y2"],
  ),
  {
    name: "d",
    values: [
      "M10 10H90V90H10Z",
      "M10,10L90,10 90,90Z",
      "m10 10h80v80h-80z",
      "M10 50A40 40 0 1 1 90 50Z",
      "M10 10Q50 90 90 10",
    ],
    probe: (a) => svg(`<path fill="#f00"${a}/>`),
  },
  {
    name: "points",
    values: ["10,10 90,10 90,90", "10 10 90 10 90 90", "10,10,90,10,50,90"],
    probe: (a) => svg(`<polygon fill="#f00"${a}/>`),
  },
  {
    name: "transform",
    values: [
      "translate(10 20)",
      "translate(10,20)",
      "scale(0.5)",
      "rotate(45 50 50)",
      "matrix(1 0 0 1 10 10)",
      "skewX(10)",
      "translate(10,20) scale(0.5)",
    ],
    probe: (a) => svg(`<rect width="60" height="60" fill="#f00"${a}/>`),
  },
  {
    name: "gradientTransform",
    values: ["rotate(45)", "scale(0.5)", "translate(0.2 0)", "skewX(20) scale(2,1)"],
    probe: (a) =>
      svg(
        `<linearGradient id="h"${a}><stop offset="0.5" stop-color="#f00"/><stop offset="0.5" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#h)"/>`,
      ),
  },
  {
    name: "gradientUnits",
    values: ["userSpaceOnUse", "objectBoundingBox"],
    probe: (a) =>
      svg(
        `<linearGradient id="h" x2="30"${a}><stop offset="0.5" stop-color="#f00"/><stop offset="0.5" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#h)"/>`,
      ),
  },
  {
    name: "spreadMethod",
    values: ["pad", "reflect", "repeat"],
    probe: (a) =>
      svg(
        `<linearGradient id="h" x2="0.3"${a}><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#h)"/>`,
      ),
  },
  ...["x1", "x2", "y2"].map((name): Place => ({
    name: `linearGradient ${name}`,
    values: ["0.3", "30%", "1", "-0.5"],
    probe: (a) =>
      svg(
        `<linearGradient id="h"${a}><stop offset="0.5" stop-color="#f00"/><stop offset="0.5" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#h)"/>`,
      ),
  })),
  ...["cx", "r", "fx", "fr"].map((name): Place => ({
    name: `radialGradient ${name}`,
    values: ["0.3", "30%", "0.1"],
    probe: (a) =>
      svg(
        `<radialGradient id="h"${a}><stop offset="0.5" stop-color="#f00"/><stop offset="0.5" stop-color="#00f"/></radialGradient><rect width="100" height="100" fill="url(#h)"/>`,
      ),
  })),
  {
    name: "gradient href",
    values: ["#a"],
    probe: (a) =>
      svg(
        `<linearGradient id="a"><stop offset="0" stop-color="#f00"/></linearGradient><linearGradient id="h"${a}/><rect width="100" height="100" fill="url(#h)"/>`,
      ),
  },
  {
    name: "use href",
    values: ["#a"],
    probe: (a) => svg(`<defs><rect id="a" width="50" height="50" fill="#f00"/></defs><use${a}/>`),
  },
  ...["x", "y"].map((name): Place => ({
    name: `use ${name}`,
    values: SIGNED,
    probe: (a) =>
      svg(`<defs><rect id="a" width="50" height="50" fill="#f00"/></defs><use href="#a"${a}/>`),
  })),
  {
    name: "clipPathUnits",
    values: ["objectBoundingBox", "userSpaceOnUse"],
    probe: (a) =>
      svg(
        `<clipPath id="c"${a}><rect width="0.5" height="0.5"/><rect x="50" y="50" width="30" height="30"/></clipPath><rect x="10" y="10" width="80" height="80" fill="#f00" clip-path="url(#c)"/>`,
      ),
  },
  {
    name: "maskUnits",
    values: ["userSpaceOnUse", "objectBoundingBox"],
    probe: (a) =>
      svg(
        `<mask id="m" x="0" y="0" width="0.5" height="50"${a}><rect width="100" height="100" fill="#fff"/></mask><rect x="10" y="10" width="80" height="80" fill="#f00" mask="url(#m)"/>`,
      ),
  },
  {
    name: "maskContentUnits",
    values: ["objectBoundingBox", "userSpaceOnUse"],
    probe: (a) =>
      svg(
        `<mask id="m"${a}><rect width="0.5" height="0.5" fill="#fff"/><rect x="50" y="50" width="30" height="30" fill="#fff"/></mask><rect x="10" y="10" width="80" height="80" fill="#f00" mask="url(#m)"/>`,
      ),
  },
  ...["x", "width"].map((name): Place => ({
    name: `mask ${name}`,
    values: name === "x" ? ["0.2", "20%", "-0.1"] : ["0.5", "50%", "1"],
    probe: (a) =>
      svg(
        `<mask id="m"${a}><rect width="100" height="100" fill="#fff"/></mask><rect x="10" y="10" width="80" height="80" fill="#f00" mask="url(#m)"/>`,
      ),
  })),
  {
    name: "viewBox",
    values: ["0 0 100 100", "10 10 50 50", "10,10,50,50", "-10 -10 200 200"],
    probe: (a) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"${a}><rect width="50" height="50" fill="#f00"/><rect x="50" y="50" width="50" height="50" fill="#00f"/></svg>`,
  },
  {
    name: "preserveAspectRatio",
    values: ["xMinYMin", "xMaxYMax meet", "xMidYMid", "xMaxYMin"],
    probe: (a) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="100"${a}><rect width="100" height="50" fill="#f00"/></svg>`,
  },
  ...["width", "height"].map((name): Place => ({
    name: `root ${name}`,
    values: ["100", "100px", "60", "1in", "75pt", "26.4583mm"],
    probe: (a) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${name === "width" ? ' height="100"' : ' width="100"'}${a}><rect width="100" height="100" fill="#f00"/></svg>`,
  })),
];

/** The attribute name each place writes; a place named `element name` writes `name`. */
function attributeName(place: Place): string {
  const parts = place.name.split(" ");
  return parts[parts.length - 1] ?? place.name;
}

const WHITESPACE = [" ", "\t", "\n", "\r", "  ", " ", " ", "　"];
const JUNK = [
  ";",
  ")",
  "(",
  "x",
  "!important",
  " !important",
  "0",
  ",",
  "/**/",
  "\\",
  "'",
  '"',
  "{",
  "}",
  "[",
  "]",
  "@",
  "#",
];
const UNITS = ["px", "PX", "em", "%", "mm", "Q", "e0", "e39", "E+1"];

/** A seeded generator (mulberry32), so a failing spelling can be replayed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function mutate(value: string, random: () => number): string {
  const pick = <T>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)] as T;
  const at = Math.floor(random() * (value.length + 1));
  const insert = (text: string): string => value.slice(0, at) + text + value.slice(at);
  const kinds: readonly (() => string)[] = [
    () => pick(WHITESPACE) + value,
    () => value + pick(WHITESPACE),
    () => insert(pick(WHITESPACE)),
    () => insert(","),
    () => value.replace(",", ",,"),
    () => value.replace(",", ""),
    () => value.replace(" ", ","),
    () => value.replace(/ /g, " , "),
    () => value.toUpperCase(),
    () => value.toLowerCase(),
    () => {
      const letter = value.search(/[a-z]/i);
      if (letter === -1) return value + "a";
      const character = value[letter] ?? "";
      const swapped =
        character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase();
      return value.slice(0, letter) + swapped + value.slice(letter + 1);
    },
    () => `'${value}'`,
    () => `"${value}"`,
    () => insert("/**/"),
    () => insert("/*;*/"),
    () => insert("\\"),
    () => value.replace(/[a-z]/i, (letter) => `\\${letter.charCodeAt(0).toString(16)} `),
    () => value.replace(/\d+(?:\.\d+)?/, (number) => number + pick(UNITS)),
    () => value.replace(/\d+(?:\.\d+)?/, (number) => `+${number}`),
    () => value.replace(/\d+(?:\.\d+)?/, (number) => `0${number}`),
    () => value.replace(/\d+(?:\.\d+)?/, "0e39"),
    () => value + pick(JUNK),
    () => insert(pick(JUNK)),
    () => value.slice(0, at) + value.slice(at + 1),
    () => value.slice(0, at) + (value[at] ?? "") + value.slice(at),
    () => "",
  ];
  let result = pick(kinds)();
  if (random() < 0.3) result = mutate(result, random);
  return result;
}

function escaped(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}

interface Case {
  readonly label: string;
  readonly original: string;
  readonly output: string;
}

/** Every spelling of every value in a place the sanitiser keeps with nothing reported. */
function keptCases(place: Place, random: () => number): Case[] {
  const name = attributeName(place);
  const cases: Case[] = [];
  const forms: readonly ((value: string) => string)[] = [
    (value) => ` ${name}="${escaped(value)}"`,
    ...(place.property === true ? [(value: string) => ` style="${escaped(value)}"`] : []),
  ];
  for (const [index, form] of forms.entries()) {
    for (const value of place.values) {
      const written = index === 0 ? value : `${name}:${value}`;
      const spellings = [written];
      for (let run = 0; run < SPELLINGS_PER_VALUE; run += 1)
        spellings.push(mutate(written, random));
      for (const spelling of spellings) {
        const original = place.probe(form(spelling));
        const result = sanitiseSvgLogo(original);
        if (!result.ok || result.removed.length > 0) continue;
        cases.push({
          label: `${place.name}${index === 0 ? "" : " in style"}: ${JSON.stringify(spelling)}`,
          original,
          output: result.svg,
        });
      }
    }
  }
  return cases;
}

const dataUrl = (text: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

interface Difference {
  readonly label: string;
  /** Pixels that differ, colour for colour, as an image and as a document. */
  readonly image: number;
  readonly document: number;
}

/**
 * Draws each original and output as a document in a frame and as an image, side by side on a grey
 * ground, takes one screenshot of the lot, and counts the pixels of each pair that differ in colour.
 */
async function differences(page: Page, cases: readonly Case[]): Promise<Difference[]> {
  const found: Difference[] = [];
  for (let start = 0; start < cases.length; start += BATCH) {
    const batch = cases.slice(start, start + BATCH);
    await page.setViewportSize({ width: CELL * 4, height: CELL * batch.length });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#7f7f7f"><div id="grid" style="display:grid;grid-template-columns:repeat(4,${String(CELL)}px);grid-auto-rows:${String(CELL)}px"></div>`,
    );
    await page.evaluate(
      async ({ batch, cell }) => {
        const grid = document.getElementById("grid");
        if (grid === null) throw new Error("no grid");
        const loads: Promise<unknown>[] = [];
        for (const { original, output } of batch) {
          for (const source of [original, output]) {
            const frame = document.createElement("iframe");
            frame.style.cssText = `border:0;width:${String(cell)}px;height:${String(cell)}px;background:transparent`;
            loads.push(
              new Promise((resolve) => {
                frame.addEventListener("load", resolve);
              }),
            );
            frame.src = source;
            grid.append(frame);
          }
          for (const source of [original, output]) {
            const box = document.createElement("div");
            box.style.cssText = "overflow:hidden;line-height:0";
            const image = new Image();
            image.src = source;
            loads.push(image.decode().catch(() => undefined));
            box.append(image);
            grid.append(box);
          }
        }
        await Promise.all(loads);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      },
      {
        batch: batch.map(({ original, output }) => ({
          original: dataUrl(original),
          output: dataUrl(output),
        })),
        cell: CELL,
      },
    );
    const shot = (await page.screenshot({ fullPage: true })).toString("base64");
    const counts = await page.evaluate(
      async ({ shot, rows, cell }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${shot}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("no 2D context");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const at = (x: number, y: number, channel: number): number =>
          pixels[(y * canvas.width + x) * 4 + channel] ?? 0;
        const result: [number, number][] = [];
        for (let row = 0; row < rows; row += 1) {
          let [image, frame] = [0, 0];
          for (let y = row * cell; y < (row + 1) * cell; y += 1) {
            for (let x = 0; x < cell; x += 1) {
              for (const [left, count] of [
                [0, "frame"],
                [2, "image"],
              ] as const) {
                let most = 0;
                for (let channel = 0; channel < 3; channel += 1) {
                  const before = at(left * cell + x, y, channel);
                  const after = at((left + 1) * cell + x, y, channel);
                  most = Math.max(most, Math.abs(before - after));
                }
                if (most > 24) {
                  if (count === "frame") frame += 1;
                  else image += 1;
                }
              }
            }
          }
          result.push([image, frame]);
        }
        return result;
      },
      { shot, rows: batch.length, cell: CELL },
    );
    for (const [index, [image, frame]] of counts.entries()) {
      const label = batch[index]?.label ?? "";
      found.push({ label, image, document: frame });
    }
  }
  return found;
}

/**
 * Antialiasing of the same geometry may differ by a few pixels from one drawing as an image to the
 * next, and nothing else may differ.
 */
const SAME = 16;

test.describe("a kept value, as Chromium reads it", () => {
  test.describe.configure({ timeout: 600_000 });
  const groups = 6;
  for (let group = 0; group < groups; group += 1) {
    const places = PLACES.filter((_, index) => index % groups === group);
    test(`draws the output as the original, for every kept spelling: ${places.map((place) => place.name).join(", ")}`, async ({
      page,
    }) => {
      const random = seeded(2_026_141 + group);
      const cases = places.flatMap((place) => keptCases(place, random));
      expect(cases.length).toBeGreaterThan(places.length);
      const differing = (await differences(page, cases))
        .filter(({ image, document }) => image > SAME || document > SAME)
        .map(
          ({ label, image, document }) =>
            `${label} (image ${String(image)}, document ${String(document)})`,
        );
      expect(differing).toEqual([]);
    });
  }
});
