import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";

// An independent model of which lengths a crop would change: each gradient's attributes resolved
// through the chain of gradients it takes them from, then the specification's defaults, and a mask's
// region by its defaults. It shares no code with the sanitiser's check.

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

interface Document {
  readonly gradients: readonly Gradient[];
  readonly painted: number | undefined;
  readonly mask: Mask | undefined;
  readonly crops: boolean;
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

function expectsRefusal(document: Document): boolean {
  if (!document.crops) return false;
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
  const mask = document.mask;
  return (
    mask !== undefined &&
    mask.attributes.get("maskUnits") === "userSpaceOnUse" &&
    Object.entries(MASK_DEFAULTS).some(([name, fallback]) =>
      isViewBoxPercentage(mask.attributes.get(name) ?? fallback),
    )
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
  return { gradients, painted, mask, crops: random() < 0.7 };
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
  const size = document.crops ? 'width="100" height="100"' : 'width="200" height="100"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" ${size} preserveAspectRatio="xMinYMid slice"><defs>${gradients}${mask}</defs><rect width="200" height="100" fill="${fill}"${masked}/></svg>`;
}

describe("a crop beside percentages of the view box, against an independent model", () => {
  it("refuses exactly the documents whose drawn gradients or masks resolve a percentage of the view box, over 4,000 random ones", () => {
    const seed = 2_026_112;
    const random = seeded(seed);
    for (let run = 0; run < 4000; run += 1) {
      const document = generate(random);
      const input = svgOf(document);
      const result = sanitiseSvgLogo(input);
      const where = `seed ${String(seed)}, run ${String(run)}: ${input}`;
      if (expectsRefusal(document)) {
        expect(result.ok || result.errors[0]?.code, where).toBe("unsupported-feature");
      } else {
        expect(result.ok ? true : result.errors, where).toBe(true);
      }
    }
  });
});
