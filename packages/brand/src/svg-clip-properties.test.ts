import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import { expectSettledLogo } from "./test-support.ts";

// Random documents built around clip paths and masks (after a reviewer's fuzzer): clip paths of
// shapes and uses with clip paths, masks, transforms, units and visibility of their own, nested in
// masks and groups, referring to one another by a handful of ids so that references cross, dangle
// and loop. Every accepted output must be settled, and no larger than a small multiple of the input.

class ClipGenerator {
  private readonly random: () => number;

  constructor(seed: number) {
    this.random = seeded(seed);
  }

  private chance(probability: number): boolean {
    return this.random() < probability;
  }

  private pick<T>(choices: readonly T[]): T {
    const choice = choices[Math.floor(this.random() * choices.length)];
    if (choice === undefined) throw new Error("nothing to pick");
    return choice;
  }

  private number(): string {
    return this.pick([
      "0",
      "1",
      "-1",
      "0.5",
      "10",
      "50%",
      "-25%",
      "100",
      "3",
      "999999",
      "1e-6",
      "250",
      "1mm",
      "0.3333333",
    ]);
  }

  private plain(): string {
    return this.number().replace(/%|mm/, "");
  }

  private reference(): string {
    // `_0` to `_2` are the names the sanitiser gives what it adds.
    return this.pick(["a", "b", "c", "d", "m", "s", "t", "logo-0", "logo-1", "_0", "_1", "_2"]);
  }

  private transform(): string {
    return this.pick([
      `translate(${this.number()} ${this.number()})`,
      `scale(${this.pick(["2", "0.5", "-1", "0", "1000"])})`,
      `rotate(${this.pick(["30", "90", "-45"])} ${this.pick(["0", "50"])} 5)`,
      `skewX(${this.pick(["10", "89.9"])})`,
    ]);
  }

  private attribute(): string {
    return this.pick([
      () => `id="${this.reference()}"`,
      () => `transform="${this.transform()}"`,
      () => `clip-path="url(#${this.reference()})"`,
      () => `mask="url(#${this.reference()})"`,
      () =>
        `style="${this.pick([`clip-path:url(#${this.reference()})`, "display:none", "visibility:hidden", "clip-rule:evenodd", "visibility:visible"])}"`,
      () => `display="${this.pick(["none", "inline"])}"`,
      () => `visibility="${this.pick(["hidden", "visible", "collapse"])}"`,
      () => `clip-rule="${this.pick(["evenodd", "nonzero"])}"`,
      () => `opacity="${this.pick(["0.5", "0", "1"])}"`,
      () => `fill="${this.pick(["#f00", "none", "url(#g)"])}"`,
      () => `stroke="${this.pick(["#000", "none"])}"`,
      () => `stroke-width="${this.number()}"`,
    ])();
  }

  private attributes(count: number): string {
    const chosen = new Map<string, string>();
    for (let index = 0; index < count; index += 1) {
      const attribute = this.attribute();
      chosen.set(attribute.split("=")[0] ?? "", attribute);
    }
    return [...chosen.values()].join(" ");
  }

  private shape(): string {
    const geometry = this.pick([
      () =>
        `rect x="${this.number()}" y="${this.number()}" width="${this.number()}" height="${this.number()}"`,
      () => `circle cx="${this.number()}" cy="${this.number()}" r="${this.number()}"`,
      () =>
        `ellipse cx="${this.number()}" cy="${this.number()}" rx="${this.number()}" ry="${this.number()}"`,
      () =>
        `line x1="${this.number()}" y1="${this.number()}" x2="${this.number()}" y2="${this.number()}"`,
      () => `path d="M${this.plain()} 0L${this.plain()} 10Q5 5 ${this.plain()} 3Z"`,
      () => `polygon points="0,0 ${this.plain()},5 5,${this.plain()}"`,
    ])();
    return `<${geometry} ${this.attributes(Math.floor(this.random() * 3))}/>`;
  }

  private use(): string {
    const position = this.chance(0.5) ? `x="${this.number()}" y="${this.number()}"` : "";
    return `<use href="#${this.reference()}" ${position} ${this.attributes(Math.floor(this.random() * 3))}/>`;
  }

  private clip(): string {
    const units = this.chance(0.4)
      ? `clipPathUnits="${this.pick(["objectBoundingBox", "userSpaceOnUse"])}"`
      : "";
    const transform = this.chance(0.3) ? `transform="${this.transform()}"` : "";
    const clipped = this.chance(0.3) ? `clip-path="url(#${this.reference()})"` : "";
    const content = Array.from({ length: 1 + Math.floor(this.random() * 3) }, () =>
      this.chance(0.5) ? this.shape() : this.use(),
    ).join("");
    return `<clipPath id="${this.reference()}" ${units} ${transform} ${clipped} ${this.attributes(Math.floor(this.random() * 2))}>${content}</clipPath>`;
  }

  private mask(depth: number): string {
    const units = this.chance(0.3) ? 'maskContentUnits="objectBoundingBox"' : "";
    const type = this.chance(0.5) ? 'mask-type="alpha"' : "";
    const content = Array.from({ length: 1 + Math.floor(this.random() * 3) }, () =>
      this.node(depth + 1),
    ).join("");
    return `<mask id="${this.reference()}" ${units} ${type}>${content}</mask>`;
  }

  private node(depth: number): string {
    const roll = this.random();
    if (depth > 4 || roll < 0.3) return this.shape();
    if (roll < 0.45) return this.use();
    if (roll < 0.6) return this.clip();
    if (roll < 0.68) return this.mask(depth);
    const name = this.pick(["g", "defs", "g"]);
    const content = Array.from({ length: Math.floor(this.random() * 4) }, () =>
      this.node(depth + 1),
    ).join("");
    return `<${name} ${this.attributes(Math.floor(this.random() * 3))}>${content}</${name}>`;
  }

  document(): string {
    const box = this.pick(["0 0 100 100", "0 0 200 50", "0 0 1 1", "-50 -50 100 100"]);
    const root = this.chance(0.1)
      ? `clip-path="url(#${this.reference()})"`
      : this.chance(0.1)
        ? `mask="url(#${this.reference()})"`
        : "";
    const aspect = this.chance(0.2)
      ? `width="${this.pick(["100", "37", "300"])}" height="${this.pick(["100", "61", "20"])}" preserveAspectRatio="${this.pick(["none", "xMinYMax slice", "xMidYMid slice", "xMaxYMin slice"])}"`
      : "";
    const content = Array.from({ length: 1 + Math.floor(this.random() * 7) }, () =>
      this.node(0),
    ).join("");
    // Drawn last, so that most clip paths are used: one nothing uses is dropped before it matters.
    const clipped = ["a", "b", "c", "d", "m", "s", "t"]
      .map((id) => `<rect width="40" height="40" clip-path="url(#${id})"/>`)
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" ${aspect} ${root}>${content}${clipped}<linearGradient id="g"><stop offset="0" stop-color="#00f"/><stop offset="1" stop-color="#0f0"/></linearGradient></svg>`;
  }
}

describe("sanitiseSvgLogo, random documents of clip paths and masks", () => {
  it("settles every accepted output, within a small multiple of the input, over 5,000 documents", () => {
    const seed = 6_002;
    const generator = new ClipGenerator(seed);
    let accepted = 0;
    let rewritten = 0;
    for (let run = 0; run < 5000; run += 1) {
      const input = generator.document();
      const where = `seed ${String(seed)}, run ${String(run)}`;
      const result = sanitiseSvgLogo(input);
      if (!result.ok) {
        expect(result.errors[0]?.code, where).not.toBe("internal-error");
        continue;
      }
      accepted += 1;
      if (result.removed.some(({ reason }) => reason === "rewritten")) rewritten += 1;
      expectSettledLogo(result.svg, where);
      expect(result.svg.length, `${where}: output size`).toBeLessThanOrEqual(
        Math.min(4 * input.length + 1024, SVG_LOGO_LIMITS.inputBytes),
      );
    }
    expect(accepted).toBeGreaterThan(1000);
    expect(rewritten).toBeGreaterThan(200);
  }, 120_000);
});
