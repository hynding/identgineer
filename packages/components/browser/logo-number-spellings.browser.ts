import { sanitiseSvgLogo } from "@identgineer/brand";
import { expect, test } from "./fixtures";

// The sanitiser reads every number by its own grammar and writes it back canonically, so a
// spelling Chromium does not take must not be taken by the sanitiser either, or the output could
// draw what the original never did. Each spelling below stands in each kind of place a number can,
// in a probe whose picture shows whether and how Chromium read it. The original, the sanitised
// output and a control with the number replaced by a token no renderer takes are each drawn as an
// image: the output must draw what the original drew, so a spelling the sanitiser keeps must be one
// Chromium reads the same way, and one it drops must be one Chromium drops too. The only
// exceptions are listed: what the sanitiser refuses or drops although Chromium draws it.

/** More characters than `numberLength` allows. */
const LONG = "50.000000000000000000000000000000000001";

/** Spellings of one number, 50 where they are numbers at all. */
const SPELLINGS: readonly string[] = [
  "50",
  "+50",
  "-50",
  "50.",
  "50.0",
  ".5e2",
  "5e1",
  "5E1",
  "5e+1",
  "5e-1",
  "500e-1",
  "5.e1",
  "5.0e1",
  "050",
  "0050",
  "-0",
  "+0",
  "50e0",
  "5e01",
  "0.5e+002",
  LONG,
  "0x32",
  "5e",
  "5e+",
  "5e-",
  ".",
  "+",
  "-",
  "e1",
  ".e1",
  ".5",
  "Infinity",
  "NaN",
  " 50",
  "50 ",
  "\t50\n",
  "5 0",
  "50.5.",
  "50.5.5",
  "++50",
  "+-50",
  "50e1.5",
  "50px",
  "50,",
  ",50",
];

/** Spellings of a pair of numbers, 50 and 50 where they are a pair of numbers at all. */
const PAIRS: readonly string[] = [
  "50 50",
  "50,50",
  "50 ,50",
  "50, 50",
  "50 , 50",
  "50,,50",
  ",50 50",
  "50 50,",
  "50-50",
  "50+50",
  "50.5.5",
  "50.50",
  "50.e1 50",
  "5e1 5e1",
  "5e1-5e1",
  "50\t\n50",
  "50  50",
  "50.,50",
];

const svg = (body: string, root = 'viewBox="0 0 100 100" width="100" height="100"'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${body}</svg>`;

const QUADRANTS =
  '<rect x="-100" y="-100" width="150" height="150" fill="#f00"/><rect x="50" y="-100" width="150" height="150" fill="#0a0"/>' +
  '<rect x="-100" y="50" width="150" height="150" fill="#00f"/><rect x="50" y="50" width="150" height="150" fill="#fc0"/>';

/** Each place a number stands, as a probe of the number written where `N` is. */
const PLACES: Readonly<Record<string, string>> = {
  "a length": svg('<rect width="N" height="100" fill="#f00"/>'),
  "a plain number": svg(
    '<linearGradient id="g"><stop offset="N" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#g)"/>',
  ),
  "a transform argument": svg(`<g transform="translate(N)">${QUADRANTS}</g>`),
  "a view box": svg(QUADRANTS, 'viewBox="N 0 100 100" width="100" height="100"'),
  "path data": svg('<path d="M0 0HNV100H0Z" fill="#f00"/>'),
  points: svg('<polygon points="0,0 N,0 N,100 0,100" fill="#f00"/>'),
  "a dash array": svg(
    '<path d="M0 50H100" stroke="#f00" stroke-width="100" stroke-dasharray="N"/>',
  ),
  "the root's width": svg(
    '<rect width="100" height="100" fill="#f00"/>',
    'viewBox="0 0 100 100" width="N" height="100"',
  ),
};

/** Each place a list of numbers stands, as a probe of the pair written where `P` is. */
const LIST_PLACES: Readonly<Record<string, string>> = {
  "a transform's arguments": svg(`<g transform="translate(P)">${QUADRANTS}</g>`),
  "a view box": svg(QUADRANTS, 'viewBox="P 100 100" width="100" height="100"'),
  "path data": svg('<path d="MP L100 50 100 100 50 100Z" fill="#f00"/>'),
  points: svg('<polygon points="P 100,50 100,100 50,100" fill="#f00"/>'),
  "a dash array": svg(
    '<path d="M0 50H100" stroke="#f00" stroke-width="100" stroke-dasharray="P"/>',
  ),
};

const dropped = (spelling: string): string =>
  `${JSON.stringify(spelling)}: Chromium takes it, the sanitiser drops it`;
const refused = (spelling: string): string =>
  `${JSON.stringify(spelling)}: Chromium takes it, the sanitiser refuses the logo`;
const refusedThoughIgnored = (spelling: string): string =>
  `${JSON.stringify(spelling)}: Chromium drops it, the sanitiser refuses the logo`;

/**
 * What the sanitiser drops or refuses although Chromium draws it, each listed in the README: a
 * number written with more characters than `numberLength` refuses the whole logo, a dash array
 * of numbers run together is dropped, and so are points of an odd count, which Chromium draws up to
 * the last whole pair; a root width Chromium ignores is refused rather than dropped.
 */
const KNOWN: Readonly<Record<string, readonly string[]>> = {
  "a length": [refused(LONG)],
  "a plain number": [refused(LONG)],
  "a transform argument": [refused(LONG)],
  "a view box": [refused(LONG)],
  "path data": [refused(LONG)],
  points: [refused(LONG)],
  "a dash array": [refused(LONG), dropped("50.5.5")],
  // A root width Chromium does not read as a plain number in a kept unit is refused, never dropped:
  // it reads it as CSS, where the sanitiser cannot tell every spelling that draws nothing.
  "the root's width": [
    ...["50.", "5.e1"].map(refusedThoughIgnored),
    refused(LONG),
    ...[
      "0x32",
      "5e",
      "5e+",
      "5e-",
      ".",
      "+",
      "-",
      "e1",
      ".e1",
      "Infinity",
      "NaN",
      "5 0",
      "50.5.",
      "50.5.5",
      "++50",
      "+-50",
      "50e1.5",
      "50,",
      ",50",
    ].map(refusedThoughIgnored),
  ],
};
const KNOWN_IN_LISTS: Readonly<Record<string, readonly string[]>> = {
  points: [dropped("50.50")],
  "a dash array": [dropped("50+50"), dropped("50.5.5")],
};

interface Probe {
  readonly spelling: string;
  readonly original: string;
  readonly control: string;
  /** `undefined` where the sanitiser refuses the logo. */
  readonly output: string | undefined;
}

const url = (text: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

function probes(template: string, marker: string, spellings: readonly string[]): Probe[] {
  return spellings.map((spelling) => {
    const original = template.replace(new RegExp(marker, "g"), spelling);
    const result = sanitiseSvgLogo(original);
    return {
      spelling,
      original: url(original),
      control: url(template.replace(new RegExp(marker, "g"), "x")),
      output: result.ok ? url(result.svg) : undefined,
    };
  });
}

/** The spellings whose output does not draw what the original drew, as Chromium draws them. */
async function disagreements(
  page: import("@playwright/test").Page,
  list: readonly Probe[],
): Promise<string[]> {
  await page.setContent("<!doctype html><body>");
  return page.evaluate(async (list) => {
    // Drawn at its natural size on a canvas larger than any probe, so a size read differently
    // shows as surely as a shape.
    const pixels = async (source: string): Promise<Uint8ClampedArray> => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("no 2D context");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 200, 200).data;
    };
    const same = (first: Uint8ClampedArray, second: Uint8ClampedArray): boolean => {
      let differing = 0;
      for (let index = 0; index < first.length; index += 4) {
        for (let channel = 0; channel < 4; channel += 1) {
          if (Math.abs((first[index + channel] ?? 0) - (second[index + channel] ?? 0)) > 8) {
            differing += 1;
            break;
          }
        }
      }
      return differing <= 4;
    };
    const found: string[] = [];
    for (const { spelling, original, control, output } of list) {
      const drawn = await pixels(original);
      const ignored = await pixels(control);
      const shown = output === undefined ? undefined : await pixels(output);
      // A refused logo shows nothing; it agrees only where the original drew nothing either.
      if (same(drawn, shown ?? new Uint8ClampedArray(drawn.length))) continue;
      const chromium = same(drawn, ignored) ? "Chromium drops it" : "Chromium takes it";
      const sanitiser =
        shown === undefined
          ? "the sanitiser refuses the logo"
          : same(shown, ignored)
            ? "the sanitiser drops it"
            : "the sanitiser keeps it";
      found.push(`${JSON.stringify(spelling)}: ${chromium}, ${sanitiser}`);
    }
    return found;
  }, list);
}

test.describe("a number as Chromium reads it", () => {
  for (const [place, template] of Object.entries(PLACES)) {
    test(`is kept exactly when Chromium takes it, in ${place}`, async ({ page }) => {
      expect(await disagreements(page, probes(template, "N", SPELLINGS))).toEqual(
        KNOWN[place] ?? [],
      );
    });
  }

  for (const [place, template] of Object.entries(LIST_PLACES)) {
    test(`is kept exactly when Chromium takes it, in a list in ${place}`, async ({ page }) => {
      expect(await disagreements(page, probes(template, "P", PAIRS))).toEqual(
        KNOWN_IN_LISTS[place] ?? [],
      );
    });
  }
});
