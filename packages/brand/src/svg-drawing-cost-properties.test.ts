import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_DRAWING_WEIGHTS as WEIGHT } from "./svg-drawing-cost.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";

// Random logos built as a graph of definitions (shapes, groups of uses, masks) whose drawing cost
// is worked out here from the graph itself, by a model written apart from the sanitiser's, and
// compared with what the sanitiser measured or why it refused.

interface Measure {
  readonly cost: number;
  readonly masks: number;
  readonly depth: number;
}

interface Item {
  readonly id: string;
  readonly markup: string;
  readonly measure: (period: number) => Measure;
}

const NONE: Measure = { cost: 0, masks: 0, depth: 0 };

function add(left: Measure, right: Measure): Measure {
  return {
    cost: left.cost + right.cost,
    masks: left.masks + right.masks,
    depth: Math.max(left.depth, right.depth),
  };
}

function shape(geometry: number, length: number, period: number): Measure {
  const dashes = period > 0 ? Math.ceil(length / period) * WEIGHT.dash : 0;
  return { cost: WEIGHT.shape + geometry + dashes, masks: 0, depth: 0 };
}

class LogoGraph {
  private readonly random: () => number;
  private readonly items: Item[] = [];
  private readonly masks: Item[] = [];
  private readonly shapes: Item[] = [];
  private readonly periods: number[] = [];

  constructor(random: () => number) {
    this.random = random;
  }

  private integer(below: number): number {
    return Math.floor(this.random() * below);
  }

  private pick<T>(items: readonly T[]): T {
    return items[this.integer(items.length)] as T;
  }

  private dash(): string {
    if (this.random() >= 0.2) return "";
    const length = (1 + this.integer(5000)) / 1000;
    this.periods.push(2 * length);
    return ` stroke-dasharray="${String(length)}"`;
  }

  private path(id: string): Item {
    const curves = this.random() < 0.3;
    const count = 1 + this.integer(curves ? 400 : 3000);
    let data = "M0 0";
    let x = 0;
    let y = 0;
    let length = 0;
    for (let index = 0; index < count; index += 1) {
      const nextX = this.integer(100);
      const nextY = this.integer(100);
      if (curves) {
        const [x1, y1, x2, y2] = [
          this.integer(100),
          this.integer(100),
          this.integer(100),
          this.integer(100),
        ];
        data += `C${String(x1)} ${String(y1)} ${String(x2)} ${String(y2)} ${String(nextX)} ${String(nextY)}`;
        length +=
          Math.hypot(x1 - x, y1 - y) +
          Math.hypot(x2 - x1, y2 - y1) +
          Math.hypot(nextX - x2, nextY - y2);
      } else {
        data += `L${String(nextX)} ${String(nextY)}`;
        length += Math.hypot(nextX - x, nextY - y);
      }
      x = nextX;
      y = nextY;
    }
    const geometry = count * (curves ? WEIGHT.cubic : WEIGHT.line);
    return {
      id,
      markup: `<path id="${id}" d="${data}"${this.dash()}/>`,
      measure: (period) => shape(geometry, length, period),
    };
  }

  private basicShape(id: string): Item {
    if (this.random() < 0.5) {
      const [width, height] = [1 + this.integer(100), 1 + this.integer(100)];
      return {
        id,
        markup: `<rect id="${id}" width="${String(width)}" height="${String(height)}"${this.dash()}/>`,
        measure: (period) => shape(4 * WEIGHT.line, 2 * (width + height), period),
      };
    }
    const radius = 1 + this.integer(50);
    return {
      id,
      markup: `<circle id="${id}" r="${String(radius)}"${this.dash()}/>`,
      measure: (period) => shape(4 * WEIGHT.cubic, 2 * Math.PI * radius, period),
    };
  }

  private use(target: Item): { markup: string; measure: (period: number) => Measure } {
    return {
      markup: `<use href="#${target.id}"/>`,
      measure: (period) =>
        add({ cost: WEIGHT.element, masks: 0, depth: 0 }, target.measure(period)),
    };
  }

  private applied(mask: Item | undefined): {
    markup: string;
    measure: (period: number) => Measure;
  } {
    if (mask === undefined) return { markup: "", measure: () => NONE };
    const attribute = mask.id.startsWith("c") ? "clip-path" : "mask";
    return {
      markup: ` ${attribute}="url(#${mask.id})"`,
      measure: (period) => {
        const inside = mask.measure(period);
        return {
          cost: WEIGHT.mask + inside.cost,
          masks: 1 + inside.masks,
          depth: 1 + inside.depth,
        };
      },
    };
  }

  private group(id: string): Item {
    const uses = Array.from({ length: 1 + this.integer(12) }, () =>
      this.use(this.pick(this.items)),
    );
    const layer = this.random() < 0.2;
    const mask =
      this.random() < 0.5 || this.masks.length === 0
        ? undefined
        : this.random() < 0.5
          ? this.masks.at(-1)
          : this.pick(this.masks);
    const applied = this.applied(mask);
    return {
      id,
      markup: `<g id="${id}"${layer ? ' opacity="0.5"' : ""}${applied.markup}>${uses.map((use) => use.markup).join("")}</g>`,
      measure: (period) =>
        [applied.measure(period), ...uses.map((use) => use.measure(period))].reduce(add, {
          cost: WEIGHT.element + (layer ? WEIGHT.layer : 0),
          masks: 0,
          depth: 0,
        }),
    };
  }

  private mask(id: string): Item {
    // A mask mostly holds a plain shape, the way masks are drawn, so its chain is not cut short by
    // the reference depth limit.
    const content = this.use(this.pick(this.random() < 0.8 ? this.shapes : this.items));
    // Mostly the newest mask, so chains of masks inside masks grow long.
    const inner = this.random() < 0.9 ? this.masks.at(-1) : undefined;
    const applied = this.applied(inner);
    const name = id.startsWith("c") ? "clipPath" : "mask";
    return {
      id,
      markup: `<${name} id="${id}"><g${applied.markup}>${content.markup}</g></${name}>`,
      measure: (period) =>
        add(
          { cost: 2 * WEIGHT.element, masks: 0, depth: 0 },
          add(applied.measure(period), content.measure(period)),
        ),
    };
  }

  build(): { svg: string; expected: Measure } {
    let definitions = "";
    for (let index = 0; index < 2 + this.integer(4); index += 1) {
      const item =
        this.random() < 0.6 ? this.path(`s${String(index)}`) : this.basicShape(`s${String(index)}`);
      this.items.push(item);
      this.shapes.push(item);
      definitions += item.markup;
    }
    // Masks come before the groups that apply them; some logos have none, some a long chain.
    const maskCount = this.integer(this.pick([1, 4, 8]));
    for (let index = 0; index < maskCount; index += 1) {
      const mask = this.mask(`${this.random() < 0.5 ? "c" : "m"}${String(index)}`);
      this.masks.push(mask);
      definitions += mask.markup;
    }
    for (let index = 0; index < 1 + this.integer(8); index += 1) {
      const group = this.group(`g${String(index)}`);
      this.items.push(group);
      definitions += group.markup;
    }
    const roots = Array.from({ length: 1 + this.integer(40) }, () =>
      this.use(this.pick(this.items)),
    );
    const period = this.periods.length === 0 ? 0 : Math.min(...this.periods);
    const expected = roots
      .map((root) => root.measure(period))
      .reduce(add, { cost: WEIGHT.element, masks: 0, depth: 0 });
    return {
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${definitions}</defs>` +
        `${roots.map((root) => root.markup).join("")}</svg>`,
      expected,
    };
  }
}

describe("the drawing cost, over random graphs of definitions", () => {
  it("matches a model of its own over 3,000 random logos, and refuses exactly what goes over a limit", () => {
    const seed = 15_002;
    const random = seeded(seed);
    const outcomes = new Map<string, number>();
    for (let run = 0; run < 3_000; run += 1) {
      const where = `seed ${String(seed)}, run ${String(run)}`;
      const { svg, expected } = new LogoGraph(random).build();
      const result = sanitiseSvgLogo(svg);
      const over = {
        "masks-too-deep": expected.depth > SVG_LOGO_LIMITS.maskDepth,
        "too-many-masks": expected.masks > SVG_LOGO_LIMITS.maskApplications,
        "drawing-too-costly": expected.cost > SVG_LOGO_LIMITS.drawingCost,
      };
      const outcome = result.ok ? "accepted" : (result.errors[0]?.code ?? "none");
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
      if (result.ok) {
        expect(result.drawingCost, where).toBe(expected.cost);
        expect(Object.values(over).some(Boolean), where).toBe(false);
        continue;
      }
      expect(["expansion-too-large", "reference-too-deep", ...Object.keys(over)], where).toContain(
        outcome,
      );
      // Refused for its element count or reference depth, it may be over the others too.
      if (outcome in over) expect(over[outcome as keyof typeof over], where).toBe(true);
    }
    // Every outcome turns up often enough to mean something.
    for (const outcome of ["accepted", "drawing-too-costly", "too-many-masks", "masks-too-deep"]) {
      expect(outcomes.get(outcome) ?? 0, outcome).toBeGreaterThan(50);
    }
  }, 120_000);
});
