import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";

// An independent model of what a browser shows of a logo and of its sanitised output, worked out
// geometrically rather than by the sanitiser's own rules. The original shows the part of its view
// box its `slice` covers its frame with, or the whole view box stretched over it (`none`), the frame
// being the width and height as written, a missing one following from the view box exactly. The
// output shows its view box fitted into its own frame (`xMidYMid meet`), letterboxed where the two
// differ, clipped to the original view box where it was stretched. The output may show less than
// the original, never more: no edge of what it shows may pass the original's by more than half a
// device pixel when the frame's longer side is 4000 device pixels.

type Rectangle = readonly [number, number, number, number];

const ALIGNMENTS = ["Min", "Mid", "Max"].flatMap((x) =>
  ["Min", "Mid", "Max"].map((y) => `x${x}Y${y}`),
);
const RATIOS = [1, 1.37, 3, 6, 20, 100, 1000, 1 / 3, 1 / 20, 1 / 1000];
const SCALES = [1, 0.01, 7.3, 100, 0.37];
const NUDGES = [0, 0.5, 0.9, 0.99, 1, 1.01, 1.1, 2, 4, 10, 100];

/** Written to six decimals, and never 0, which is no size at all. */
function written(value: number): string {
  const rounded = Number(value.toFixed(6));
  return String(rounded === 0 ? Math.sign(value) * 0.000001 || 0.000001 : rounded);
}

function share(part: string): number {
  return ["Min", "Mid", "Max"].indexOf(part) / 2;
}

interface Case {
  readonly svg: string;
  readonly box: Rectangle;
  /** The frame as a browser takes the original's: as written, a missing side exactly in proportion. */
  readonly frame: { readonly width: number; readonly height: number };
  readonly align: string;
  readonly mode: "slice" | "none";
}

/** A view box from about 1.4 to 8,000 units wide, or with `tiny`, from 0.0009 to 0.37. */
function generate(random: () => number, tiny: boolean): Case {
  const pick = <T>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)] as T;
  const ratio = pick(RATIOS);
  const width = written(Math.exp(tiny ? random() * 6 - 7 : random() * 9 + 2));
  const height = written(Number(width) / ratio);
  const x = random() < 0.5 ? "0" : written((random() - 0.5) * Number(width) * 3);
  const y = random() < 0.5 ? "0" : written((random() - 0.5) * Number(height) * 3);
  const scale = pick(SCALES);
  const nudge =
    (random() < 0.5 ? pick(NUDGES) : Math.exp(random() * 8 - 3)) * (random() < 0.5 ? -1 : 1);
  // Off the view box's proportions by about `nudge` half device pixels, on one side or the other.
  const off = 1 + (nudge * 0.5) / 4000;
  const across = random() < 0.5;
  const frameWidth = written(Number(width) * scale * (across ? off : 1));
  const frameHeight = written(Number(height) * scale * (across ? 1 : off));
  const align = pick(ALIGNMENTS);
  const mode = random() < 0.8 ? "slice" : "none";
  const sides = random() < 0.7 ? "both" : random() < 0.5 ? "width" : "height";
  const box: Rectangle = [Number(x), Number(y), Number(width), Number(height)];
  const frame = {
    width: sides === "height" ? (Number(frameHeight) * box[2]) / box[3] : Number(frameWidth),
    height: sides === "width" ? (Number(frameWidth) * box[3]) / box[2] : Number(frameHeight),
  };
  const size =
    (sides === "height" ? "" : ` width="${frameWidth}"`) +
    (sides === "width" ? "" : ` height="${frameHeight}"`);
  const aspect = mode === "none" ? "none" : `${align} slice`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}"${size} preserveAspectRatio="${aspect}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#f00"/></svg>`;
  return { svg, box, frame, align, mode };
}

/** The part of user space the original shows, as left, top, right and bottom. */
function shownByOriginal({ box, frame, align, mode }: Case): Rectangle {
  const [x, y, width, height] = box;
  if (mode === "none") return [x, y, x + width, y + height];
  const scale = Math.max(frame.width / width, frame.height / height);
  const [shownWidth, shownHeight] = [frame.width / scale, frame.height / scale];
  const left = x + (width - shownWidth) * share(align.slice(1, 4));
  const top = y + (height - shownHeight) * share(align.slice(5, 8));
  return [left, top, left + shownWidth, top + shownHeight];
}

/** How far, in device pixels, the output shows past what the original shows on any side. */
function reveal(
  original: Case,
  output: {
    readonly svg: string;
    readonly width: number;
    readonly height: number;
    readonly viewBox: readonly number[];
  },
): number {
  const shown = shownByOriginal(original);
  const [x = 0, y = 0, width = 1, height = 1] = output.viewBox;
  const scale = Math.min(output.width / width, output.height / height);
  const [fittedWidth, fittedHeight] = [output.width / scale, output.height / scale];
  let left = x - (fittedWidth - width) / 2;
  let top = y - (fittedHeight - height) / 2;
  let right = left + fittedWidth;
  let bottom = top + fittedHeight;
  if (output.svg.includes("<clipPath")) {
    const [boxX, boxY, boxWidth, boxHeight] = original.box;
    [left, top] = [Math.max(left, boxX), Math.max(top, boxY)];
    [right, bottom] = [Math.min(right, boxX + boxWidth), Math.min(bottom, boxY + boxHeight)];
  }
  const devicePixels = (scale * 4000) / Math.max(output.width, output.height);
  return (
    Math.max(shown[0] - left, shown[1] - top, right - shown[2], bottom - shown[3]) * devicePixels
  );
}

describe("a slice or stretch, against an independent model of what a browser shows", () => {
  it.each([
    ["ordinary view boxes", false, 2_026_111],
    ["view boxes a fraction of a unit across", true, 2_026_112],
  ])(
    "never shows more than half a device pixel past what the original showed, over 6,000 %s",
    (_, tiny, seed) => {
      const random = seeded(seed);
      let worst = 0;
      for (let run = 0; run < 6000; run += 1) {
        const original = generate(random, tiny);
        const result = sanitiseSvgLogo(original.svg);
        const where = `seed ${String(seed)}, run ${String(run)}: ${original.svg}`;
        if (!result.ok) {
          expect(["unsupported-feature", "number-out-of-range", "missing-size"], where).toContain(
            result.errors[0]?.code,
          );
          continue;
        }
        const revealed = reveal(original, result);
        worst = Math.max(worst, revealed);
        expect(revealed, where).toBeLessThanOrEqual(0.5 + 1e-6);
      }
      expect(worst).toBeGreaterThan(0.4);
    },
  );
});
