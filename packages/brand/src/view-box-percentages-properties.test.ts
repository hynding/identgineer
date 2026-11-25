import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";

// An independent model of when a slice crops and which lengths a crop would change. A frame under
// a pixel on either side is refused. A slice crops when the view box kept whole, fitted into the
// frame and centred, would put any edge of what is shown more than half a device pixel at 4000 from
// where the slice put it; the crop is the part of the view box the frame shows, written to six
// decimals, and refused where that part, fitted and centred in the same way, would do the same.
// Each gradient's attributes are resolved through the chain of gradients it takes them from, then
// the specification's defaults, and a mask's region by its defaults. It shares no code with the
// sanitiser.

type Kind = "linearGradient" | "radialGradient";

interface Gradient {
  readonly kind: Kind;
  readonly attributes: ReadonlyMap<string, string>;
  /** The index of the gradient it takes from, always an earlier one, so there is no cycle. */
  readonly from: number | undefined;
}

interface Mask {
  readonly attributes: ReadonlyMap<string, string>;
}

type Box = readonly [number, number, number, number];

interface Document {
  readonly gradients: readonly Gradient[];
  readonly painted: number | undefined;
  readonly mask: Mask | undefined;
  readonly box: Box;
  readonly frame: { readonly width: number; readonly height: number };
  readonly align: string;
}

const DEVICE_PIXELS = 4000;
const ALIGNMENTS = ["Min", "Mid", "Max"].flatMap((x) =>
  ["Min", "Mid", "Max"].map((y) => `x${x}Y${y}`),
);

function sixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function underAPixel(document: Document): boolean {
  return Math.min(document.frame.width, document.frame.height) < 1;
}

function crops(document: Document): boolean {
  return movesAnEdge(document, document.box);
}

/** The part of the view box the frame shows, exactly. */
function shownPart(document: Document): Box {
  const [x, y, width, height] = document.box;
  const scale = Math.max(document.frame.width / width, document.frame.height / height);
  const [shownWidth, shownHeight] = [document.frame.width / scale, document.frame.height / scale];
  const share = (part: string): number => ["Min", "Mid", "Max"].indexOf(part) / 2;
  return [
    x + (width - shownWidth) * share(document.align.slice(1, 4)),
    y + (height - shownHeight) * share(document.align.slice(5, 8)),
    shownWidth,
    shownHeight,
  ];
}

/** Whether a view box, fitted into the frame and centred, moves an edge of what the slice showed. */
function movesAnEdge(
  document: Document,
  [writtenX, writtenY, writtenWidth, writtenHeight]: Box,
): boolean {
  const [x, y, width, height] = shownPart(document);
  const fit = Math.min(document.frame.width / writtenWidth, document.frame.height / writtenHeight);
  const [fittedWidth, fittedHeight] = [document.frame.width / fit, document.frame.height / fit];
  const left = writtenX - (fittedWidth - writtenWidth) / 2;
  const top = writtenY - (fittedHeight - writtenHeight) / 2;
  const apart = Math.max(
    Math.abs(left - x),
    Math.abs(top - y),
    Math.abs(left + fittedWidth - (x + width)),
    Math.abs(top + fittedHeight - (y + height)),
  );
  return (apart * DEVICE_PIXELS) / Math.max(width, height) > 0.5;
}

function cannotBeWritten(document: Document): boolean {
  const [x = 0, y = 0, width = 1, height = 1] = shownPart(document).map(sixDecimals);
  return movesAnEdge(document, [x, y, width, height]);
}

const COORDINATES: Readonly<Record<Kind, readonly string[]>> = {
  linearGradient: ["x1", "y1", "x2", "y2"],
  radialGradient: ["cx", "cy", "r", "fx", "fy", "fr"],
};
const DEFAULTS: Readonly<Record<string, string>> = {
  x1: "0%",
  y1: "0%",
  x2: "100%",
  y2: "0%",
  cx: "50%",
  cy: "50%",
  r: "50%",
  fr: "0%",
};
const MASK_DEFAULTS: Readonly<Record<string, string>> = {
  x: "-10%",
  y: "-10%",
  width: "120%",
  height: "120%",
};
const VALUES = ["0%", "40%", "5", "12.5"];
const UNITS = [undefined, "userSpaceOnUse", "objectBoundingBox"];

function isViewBoxPercentage(value: string): boolean {
  return value.endsWith("%") && Number(value.slice(0, -1)) !== 0;
}

/** The gradients a painted one takes from, nearest first, itself included. */
function chainOf(document: Document, index: number): Gradient[] {
  const chain: Gradient[] = [];
  for (let at: number | undefined = index; at !== undefined;) {
    const gradient: Gradient | undefined = document.gradients[at];
    if (gradient === undefined) break;
    chain.push(gradient);
    at = gradient.from;
  }
  return chain;
}

function effective(chain: readonly Gradient[], name: string): string {
  const kind = chain[0]?.kind;
  // Chromium takes a coordinate from the nearest gradient of the same kind, past any of the other.
  const written = chain.find((gradient) => gradient.kind === kind && gradient.attributes.has(name));
  const value = written?.attributes.get(name);
  if (value !== undefined) return value;
  if (name === "fx") return effective(chain, "cx");
  if (name === "fy") return effective(chain, "cy");
  return DEFAULTS[name] ?? "0";
}

function takesTheViewBox(document: Document): boolean {
  if (document.painted !== undefined) {
    const chain = chainOf(document, document.painted);
    const units =
      chain
        .find((gradient) => gradient.attributes.has("gradientUnits"))
        ?.attributes.get("gradientUnits") ?? "objectBoundingBox";
    const kind = chain[0]?.kind ?? "linearGradient";
    if (
      units === "userSpaceOnUse" &&
      COORDINATES[kind].some((name) => isViewBoxPercentage(effective(chain, name)))
    ) {
      return true;
    }
  }
  const mask = document.mask?.attributes;
  if (mask?.get("maskUnits") !== "userSpaceOnUse") return false;
  return Object.entries(MASK_DEFAULTS).some(([name, fallback]) =>
    isViewBoxPercentage(mask.get(name) ?? fallback),
  );
}

function generate(random: () => number): Document {
  const pick = <T>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)] as T;
  const gradients: Gradient[] = [];
  const count = 1 + Math.floor(random() * 4);
  for (let index = 0; index < count; index += 1) {
    const kind: Kind = random() < 0.5 ? "linearGradient" : "radialGradient";
    const attributes = new Map<string, string>();
    const units = pick(UNITS);
    if (units !== undefined) attributes.set("gradientUnits", units);
    for (const name of COORDINATES[kind]) if (random() < 0.4) attributes.set(name, pick(VALUES));
    const from = index > 0 && random() < 0.6 ? Math.floor(random() * index) : undefined;
    gradients.push({ kind, attributes, from });
  }
  let mask: Mask | undefined;
  if (random() < 0.4) {
    const attributes = new Map<string, string>();
    const units = pick(UNITS);
    if (units !== undefined) attributes.set("maskUnits", units);
    for (const name of Object.keys(MASK_DEFAULTS)) {
      if (random() < 0.6) attributes.set(name, pick(VALUES));
    }
    mask = { attributes };
  }
  const painted = random() < 0.85 ? Math.floor(random() * count) : undefined;
  // Up to 1000 to 1 either way, framed in its own proportions, nearly them or far from them.
  const width = pick([200, 1000, 1, 37.5, 0.02]);
  const height = Math.max(0.000001, sixDecimals(width / 10 ** (random() * 6 - 3)));
  const box: Box = [pick([0, -37.5, 12.25, 0.000001]), pick([0, -1, 0.5]), width, height];
  const frameWidth = pick([100, 1000, 7, 2000, 0.875]);
  const off = pick([0, 0, 1e-7, -1e-7, 1e-5, -1e-5, 1e-3, -0.3, 0.5]);
  const frameHeight = Math.min(
    999_999,
    Math.max(0.000001, sixDecimals(((frameWidth * height) / width) * (1 + off))),
  );
  const frame = { width: frameWidth, height: frameHeight };
  return { gradients, painted, mask, box, frame, align: pick(ALIGNMENTS) };
}

function written(attributes: ReadonlyMap<string, string>): string {
  return [...attributes].map(([name, value]) => ` ${name}="${value}"`).join("");
}

function svgOf(document: Document): string {
  const gradients = document.gradients
    .map((gradient, index) => {
      const from = gradient.from === undefined ? "" : ` href="#g${String(gradient.from)}"`;
      return `<${gradient.kind} id="g${String(index)}"${from}${written(gradient.attributes)}><stop offset="0" stop-color="#00f"/><stop offset="1" stop-color="#f00"/></${gradient.kind}>`;
    })
    .join("");
  const mask =
    document.mask === undefined
      ? ""
      : `<mask id="m"${written(document.mask.attributes)}><rect width="200" height="100" fill="#fff"/></mask>`;
  const fill = document.painted === undefined ? "#0f766e" : `url(#g${String(document.painted)})`;
  const masked = document.mask === undefined ? "" : ' mask="url(#m)"';
  const frame = `width="${String(document.frame.width)}" height="${String(document.frame.height)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${document.box.join(" ")}" ${frame} preserveAspectRatio="${document.align} slice"><defs>${gradients}${mask}</defs><rect width="200" height="100" fill="${fill}"${masked}/></svg>`;
}

describe("a slice, against an independent model", () => {
  it("crops exactly where dropping it would move anything by more than half a device pixel, and refuses a crop beside a percentage of the view box, over 6,000 random ones", () => {
    const seed = 2_026_112;
    const random = seeded(seed);
    for (let run = 0; run < 6000; run += 1) {
      const document = generate(random);
      const input = svgOf(document);
      const result = sanitiseSvgLogo(input);
      const where = `seed ${String(seed)}, run ${String(run)}: ${input}`;
      if (underAPixel(document)) {
        expect(result.ok || result.errors[0]?.code, where).toBe("unsupported-feature");
      } else if (!crops(document)) {
        expect(result.ok ? result.viewBox : result.errors, where).toEqual(document.box);
      } else if (cannotBeWritten(document) || takesTheViewBox(document)) {
        expect(result.ok || result.errors[0]?.code, where).toBe("unsupported-feature");
      } else {
        expect(result.ok ? result.viewBox : result.errors, where).toEqual(
          shownPart(document).map(sixDecimals),
        );
      }
    }
  });
});
