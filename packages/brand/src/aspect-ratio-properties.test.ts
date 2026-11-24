import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";

// An independent model of what a browser shows of a logo and of its sanitised output, worked out
// geometrically rather than by the sanitiser's own rules. The original shows its view box fitted
// into its frame (`meet`, with its alignment), the part of it a `slice` covers its frame with, or the
// whole view box stretched over it (`none`), the frame being the width and height exactly as written,
// in CSS pixels whatever the unit, a missing one following from the view box exactly. The output
// shows its view box fitted into its own frame with its own alignment, letterboxed where the two
// differ, clipped to the original view box where it was stretched. The output may show less than
// the original, never more: no edge of what it shows may pass the original's by more than half a
// device pixel when the frame's longer side is 4000 device pixels.

type Rectangle = readonly [number, number, number, number];
interface Frame {
  readonly width: number;
  readonly height: number;
}

const ALIGNMENTS = ["Min", "Mid", "Max"].flatMap((x) =>
  ["Min", "Mid", "Max"].map((y) => `x${x}Y${y}`),
);
const RATIOS = [1, 1.37, 3, 6, 20, 100, 1000, 1 / 3, 1 / 20, 1 / 1000];
const SCALES = [1, 0.01, 7.3, 100, 0.37, 0.001, 1000];
const NUDGES = [0, 0.5, 0.9, 0.99, 1, 1.01, 1.1, 2, 4, 10, 100];
const PIXELS_PER_UNIT: Readonly<Record<string, number>> = {
  "": 1,
  px: 1,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
  pt: 4 / 3,
  pc: 16,
};
const UNITS = Object.keys(PIXELS_PER_UNIT);

/** Written to six decimals, and never 0, which is no size at all. */
function written(value: number): string {
  const rounded = Number(value.toFixed(6));
  return String(rounded === 0 ? Math.sign(value) * 0.000001 || 0.000001 : rounded);
}

/** Written to ten significant digits, often more decimals than the output keeps. */
function precise(value: number): string {
  return String(Number(value.toPrecision(10)));
}

function share(part: string): number {
  return ["Min", "Mid", "Max"].indexOf(part) / 2;
}

interface Case {
  readonly svg: string;
  readonly box: Rectangle;
  /** The frame as a browser takes the original's: as written, a missing side exactly in proportion. */
  readonly frame: Frame;
  /** The width and height given, in CSS pixels, exactly. */
  readonly given: { readonly width?: number; readonly height?: number };
  readonly align: string;
  readonly mode: "meet" | "slice" | "none";
}

interface Sides {
  readonly box: Rectangle;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly unit: string;
  readonly digits: (value: number) => string;
  readonly align: string;
  readonly mode: "meet" | "slice" | "none";
  readonly sides: "both" | "width" | "height" | "neither";
}

function build({ box, frameWidth, frameHeight, unit, digits, align, mode, sides }: Sides): Case {
  const factor = PIXELS_PER_UNIT[unit] ?? 1;
  const [x, y, width, height] = box;
  const writtenWidth = digits(frameWidth / factor);
  const writtenHeight = digits(frameHeight / factor);
  const given = {
    ...(sides === "both" || sides === "width" ? { width: Number(writtenWidth) * factor } : {}),
    ...(sides === "both" || sides === "height" ? { height: Number(writtenHeight) * factor } : {}),
  };
  const frame =
    given.width === undefined && given.height === undefined
      ? { width, height }
      : {
          width: given.width ?? ((given.height ?? 0) * width) / height,
          height: given.height ?? ((given.width ?? 0) * height) / width,
        };
  const size =
    (given.width === undefined ? "" : ` width="${writtenWidth}${unit}"`) +
    (given.height === undefined ? "" : ` height="${writtenHeight}${unit}"`);
  const aspect = mode === "none" ? "none" : mode === "slice" ? `${align} slice` : align;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${String(x)} ${String(y)} ${String(width)} ${String(height)}"${size} preserveAspectRatio="${aspect}"><rect x="${String(x)}" y="${String(y)}" width="${String(width)}" height="${String(height)}" fill="#f00"/></svg>`;
  return { svg, box, frame, given, align, mode };
}

/**
 * A view box from about 1.4 to 8,000 units wide, or with `tiny`, from 0.0009 to 0.37, in a frame
 * from a thousandth to a thousand times its size, in any absolute unit, to six decimals or more.
 */
function generate(random: () => number, tiny: boolean): Case {
  const pick = <T>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)] as T;
  const ratio = pick(RATIOS);
  const width = Number(written(Math.exp(tiny ? random() * 6 - 7 : random() * 9 + 2)));
  const height = Number(written(width / ratio));
  const x = random() < 0.5 ? 0 : Number(written((random() - 0.5) * width * 3));
  const y = random() < 0.5 ? 0 : Number(written((random() - 0.5) * height * 3));
  const scale = pick(SCALES);
  const nudge =
    (random() < 0.5 ? pick(NUDGES) : Math.exp(random() * 8 - 3)) * (random() < 0.5 ? -1 : 1);
  // Off the view box's proportions by about `nudge` half device pixels, on one side or the other.
  const off = 1 + (nudge * 0.5) / 4000;
  const across = random() < 0.5;
  return build({
    box: [x, y, width, height],
    frameWidth: width * scale * (across ? off : 1),
    frameHeight: height * scale * (across ? 1 : off),
    unit: pick(UNITS),
    digits: random() < 0.5 ? written : precise,
    align: pick(ALIGNMENTS),
    mode: random() < 0.6 ? "slice" : random() < 0.5 ? "none" : "meet",
    sides: random() < 0.7 ? "both" : random() < 0.5 ? "width" : "height",
  });
}

/** A logo as design tools export one: two or three decimals, an ordinary size, in pixels or points. */
function generateExported(random: () => number): Case {
  const pick = <T>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)] as T;
  const decimals = pick([0, 2, 3]);
  const at = (value: number): number => Number(value.toFixed(decimals));
  const width = at(10 + random() * 2000);
  const height = at(10 + random() * 2000);
  const scale = pick([1, 0.5, 2, 0.1, 10, 0.37]);
  const off = random() < 0.5 ? 1 : 1 + Math.exp(-random() * 12) * (random() < 0.5 ? -1 : 1);
  const across = random() < 0.5;
  return build({
    box: [
      random() < 0.7 ? 0 : at(random() * 100 - 50),
      random() < 0.7 ? 0 : at(random() * 100),
      width,
      height,
    ],
    frameWidth: width * scale * (across ? off : 1),
    frameHeight: height * scale * (across ? 1 : off),
    unit: pick(["", "", "px", "pt"]),
    digits: (value) => String(Number(value.toFixed(pick([0, 1, 2, 3])))),
    align: pick(ALIGNMENTS),
    mode: pick(["meet", "slice", "slice", "none"] as const),
    sides: pick(["both", "both", "width", "height", "neither"] as const),
  });
}

/** The part of user space a view box shows fitted into a frame, letterbox included. */
function fitted([x, y, width, height]: Rectangle, frame: Frame, align: string): Rectangle {
  const scale = Math.min(frame.width / width, frame.height / height);
  const [shownWidth, shownHeight] = [frame.width / scale, frame.height / scale];
  const left = x - (shownWidth - width) * share(align.slice(1, 4));
  const top = y - (shownHeight - height) * share(align.slice(5, 8));
  return [left, top, left + shownWidth, top + shownHeight];
}

/** The part of user space the original shows, as left, top, right and bottom. */
function shownByOriginal({ box, frame, align, mode }: Case): Rectangle {
  const [x, y, width, height] = box;
  if (mode === "none") return [x, y, x + width, y + height];
  if (mode === "meet") return fitted(box, frame, align);
  const scale = Math.max(frame.width / width, frame.height / height);
  const [shownWidth, shownHeight] = [frame.width / scale, frame.height / scale];
  const left = x + (width - shownWidth) * share(align.slice(1, 4));
  const top = y + (height - shownHeight) * share(align.slice(5, 8));
  return [left, top, left + shownWidth, top + shownHeight];
}

/** What a view box written into a frame shows, as left, top, right and bottom. */
function shownByOutput(
  viewBox: Rectangle,
  frame: Frame,
  align: string,
  clipTo: Rectangle | undefined,
): Rectangle {
  const [left, top, right, bottom] = fitted(viewBox, frame, align);
  if (clipTo === undefined) return [left, top, right, bottom];
  const [x, y, width, height] = clipTo;
  return [
    Math.max(left, x),
    Math.max(top, y),
    Math.min(right, x + width),
    Math.min(bottom, y + height),
  ];
}

/** How far, in device pixels, one region passes another on any side, at 4000 along the longer. */
function past(original: Rectangle, shown: Rectangle, outward: boolean): number {
  const devicePixels = 4000 / Math.max(original[2] - original[0], original[3] - original[1]);
  const edges = [
    original[0] - shown[0],
    original[1] - shown[1],
    shown[2] - original[2],
    shown[3] - original[3],
  ];
  return Math.max(...edges.map((edge) => (outward ? edge : Math.abs(edge)))) * devicePixels;
}

interface Output {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly viewBox: readonly number[];
}

/** How far, in device pixels, the output shows past what the original shows on any side. */
function reveal(original: Case, output: Output): number {
  const [x = 0, y = 0, width = 1, height = 1] = output.viewBox;
  const align = /preserveAspectRatio="(x\w+)"/.exec(output.svg)?.[1] ?? "xMidYMid";
  const clipTo = output.svg.includes("<clipPath") ? original.box : undefined;
  const shown = shownByOutput([x, y, width, height], output, align, clipTo);
  return past(shownByOriginal(original), shown, true);
}

/**
 * Whether some view box written to six decimals, drawn in the frame six decimals write, would show
 * what the original showed to within half a device pixel on every side: the view box itself, or,
 * for a crop, the part it showed, each edge to six decimals; stretched, clipped to the view box.
 */
function couldBeWritten(original: Case): boolean {
  const six = (value: number): number => Number(value.toFixed(6));
  const [, , width, height] = original.box;
  const frame = {
    width: six(original.given.width ?? ((original.given.height ?? height) * width) / height),
    height: six(original.given.height ?? ((original.given.width ?? width) * height) / width),
  };
  // A frame under a pixel is out of scope, whatever six decimals could do.
  if (Math.min(frame.width, frame.height) < 1) return false;
  const exact = shownByOriginal(original);
  const crop: Rectangle = [
    six(exact[0]),
    six(exact[1]),
    six(exact[2] - exact[0]),
    six(exact[3] - exact[1]),
  ];
  const align = original.mode === "meet" ? original.align : "xMidYMid";
  const candidates = original.mode === "slice" ? [original.box, crop] : [original.box];
  return candidates.some((viewBox) =>
    [undefined, ...(original.mode === "none" ? [original.box] : [])].some(
      (clipTo) => past(exact, shownByOutput(viewBox, frame, align, clipTo), false) <= 0.5,
    ),
  );
}

describe("a meet, slice or stretch, against an independent model of what a browser shows", () => {
  it.each([
    ["ordinary view boxes", false, 2_026_121],
    ["view boxes a fraction of a unit across", true, 2_026_122],
  ])(
    "never shows more than half a device pixel past what the original showed, over 6,000 %s",
    (_, tiny, seed) => {
      const random = seeded(seed);
      let worst = 0;
      for (let run = 0; run < 6000; run += 1) {
        const original = generate(random, tiny);
        const result = sanitiseSvgLogo(original.svg);
        const where = `seed ${String(seed)}, run ${String(run)}: ${original.svg}`;
        const smallest = Math.min(original.given.width ?? 1, original.given.height ?? 1);
        if (!result.ok) {
          expect(["unsupported-feature", "number-out-of-range", "missing-size"], where).toContain(
            result.errors[0]?.code,
          );
          continue;
        }
        expect(smallest, `${where}: a size under a pixel is refused`).toBeGreaterThanOrEqual(1);
        const revealed = reveal(original, result);
        worst = Math.max(worst, revealed);
        expect(revealed, where).toBeLessThanOrEqual(0.5 + 1e-6);
      }
      expect(worst).toBeGreaterThan(0.4);
    },
  );

  it("refuses no exported logo that some view box written to six decimals could show, over 6,000", () => {
    const random = seeded(2_026_123);
    const falseRefusals: string[] = [];
    for (let run = 0; run < 6000; run += 1) {
      const original = generateExported(random);
      const result = sanitiseSvgLogo(original.svg);
      if (result.ok) {
        expect(reveal(original, result), original.svg).toBeLessThanOrEqual(0.5 + 1e-6);
      } else if (couldBeWritten(original)) {
        falseRefusals.push(`${result.errors[0]?.code ?? ""}: ${original.svg}`);
      }
    }
    expect(falseRefusals).toEqual([]);
  });
});
