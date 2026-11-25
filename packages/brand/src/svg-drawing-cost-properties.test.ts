import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_DRAWING_WEIGHTS as WEIGHT } from "./svg-drawing-cost.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import { SVG_OVERDRAW_WEIGHTS as PAINT } from "./svg-overdraw.ts";
import { expectSettledLogo } from "./test-support.ts";

// Random logos built as a graph of definitions (shapes, groups of uses, masks) whose drawing cost
// and overdraw are worked out here from the graph itself, by a model written apart from the
// sanitiser's, and compared with what the sanitiser measured or why it refused. Nothing is
// transformed and every paint is the default solid black, so each definition paints the same
// wherever it is used: its overdraw is its own, drawn as itself or as part of a clip path. The
// sanitiser bounds lengths and dash periods over every reading Chromium can make of the numbers, a
// hair from the exact ones, so its measure must lie between the model read exactly and the model
// read with every length a hair longer and every period a hair shorter.

/** The view box is 100 by 100: one unit of overdraw is 10,000 square user units. */
const SIDE = 100;

interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const NO_BOX: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

function joined(left: Box, right: Box): Box {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

/** The share of the image a box covers, at most all of it. */
function share(box: Box): number {
  if (box.minX > box.maxX) return 0;
  return Math.min(1, ((box.maxX - box.minX) * (box.maxY - box.minY)) / (SIDE * SIDE));
}

interface Paint {
  readonly overdraw: number;
  readonly box: Box;
}

/** How the model reads a length of so many segments, and a dash period. */
interface Reading {
  readonly length: (length: number, segments: number) => number;
  readonly period: (period: number) => number;
}

const EXACT: Reading = { length: (length) => length, period: (period) => period };
/** Longer and shorter than any reading the sanitiser bounds: a ten-thousandth, and a few hundredths
 * a segment, more than single precision can move a number of this view box. */
const LOOSEST: Reading = {
  length: (length, segments) => length * (1 + 1e-4) + segments * 0.05,
  period: (period) => period * (1 - 1e-4),
};

/**
 * What a shape paints: its fill, at most the whole image, and its edges, as long as its outline or
 * as `visible`, the most of it the image can show, whichever is less.
 */
function filled(
  area: number,
  visible: number,
  length: number,
  segments: number,
  box: Box,
  reading: Reading,
): Paint {
  // Edges laid end to end across the image that many times put about that many on every row,
  // and each costs more the more there are.
  const sides = Math.min(visible, reading.length(length, segments) / SIDE);
  return {
    overdraw:
      Math.min(1, area / (SIDE * SIDE)) * PAINT.solid +
      sides * PAINT.edge * (1 + (sides / PAINT.edgesPerRow) ** 2),
    box,
  };
}

function triangle(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  const [ax = 0, ay = 0] = a;
  const [bx = 0, by = 0] = b;
  const [cx = 0, cy = 0] = c;
  return Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
}

interface Measure {
  readonly cost: number;
  readonly masks: number;
  readonly depth: number;
}

interface Item {
  readonly id: string;
  readonly markup: string;
  readonly measure: (dashes: Dashes) => Measure;
  /** What it paints, drawn as itself or (`clipping`) as coverage inside a clip path. */
  readonly paint: (clipping: boolean, reading: Reading) => Paint;
  /** Whether it has a clip path or mask of its own; for a clip path, whether what it holds has. */
  readonly clipped: boolean;
}

const NONE: Measure = { cost: 0, masks: 0, depth: 0 };

function add(left: Measure, right: Measure): Measure {
  return {
    cost: left.cost + right.cost,
    masks: left.masks + right.masks,
    depth: Math.max(left.depth, right.depth),
  };
}

/** The shortest dash period in a logo and the most dashes in one repeat, worked out separately. */
interface Dashes {
  readonly period: number;
  readonly perPeriod: number;
  readonly reading: Reading;
}

/**
 * A shape's cost; `dash` is what each dash weighs, more on anything but one run of horizontal and
 * vertical lines.
 */
function shape(
  geometry: number,
  length: number,
  segments: number,
  dash: number,
  dashes: Dashes,
): Measure {
  const { reading } = dashes;
  // Every shape here is one subpath, which may start the pattern afresh: one more repeat.
  const count =
    dashes.period > 0
      ? (Math.ceil(reading.length(length, segments) / reading.period(dashes.period)) + 1) *
        dashes.perPeriod
      : 0;
  return { cost: WEIGHT.shape + geometry + count * dash, masks: 0, depth: 0 };
}

class LogoGraph {
  private readonly random: () => number;
  private readonly items: Item[] = [];
  private readonly masks: Item[] = [];
  private readonly shapes: Item[] = [];
  /** The dashing of each dashed shape, by id. */
  private readonly dashing = new Map<string, Omit<Dashes, "reading">>();

  constructor(random: () => number) {
    this.random = random;
  }

  private integer(below: number): number {
    return Math.floor(this.random() * below);
  }

  private pick<T>(items: readonly T[]): T {
    return items[this.integer(items.length)] as T;
  }

  private dash(id: string): string {
    if (this.random() >= 0.2) return "";
    const length = (1 + this.integer(5000)) / 1000;
    // An odd array repeats twice over.
    const entries = this.pick([1, 2, 3, 64]);
    const odd = entries % 2 === 1;
    this.dashing.set(id, {
      period: (odd ? 2 : 1) * entries * length,
      perPeriod: odd ? entries : entries / 2,
    });
    return ` stroke-dasharray="${Array.from({ length: entries }, () => String(length)).join(" ")}"`;
  }

  private path(id: string): Item {
    const curves = this.random() < 0.3;
    const count = 1 + this.integer(curves ? 400 : 3000);
    let data = "M0 0";
    let x = 0;
    let y = 0;
    let length = 0;
    // The area bound: triangles fanned from the start over the control polygon, and each curve's
    // hull; the box holds every point.
    let area = 0;
    let box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const reach = (px: number, py: number): void => {
      box = joined(box, { minX: px, minY: py, maxX: px, maxY: py });
    };
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
        const [p0, p1, p2, p3] = [
          [x, y],
          [x1, y1],
          [x2, y2],
          [nextX, nextY],
        ];
        area +=
          triangle([0, 0], p0, p1) +
          triangle([0, 0], p1, p2) +
          triangle([0, 0], p2, p3) +
          triangle(p0, p1, p2) +
          triangle(p0, p2, p3) +
          triangle(p0, p1, p3) +
          triangle(p1, p2, p3);
        reach(x1, y1);
        reach(x2, y2);
      } else {
        data += `L${String(nextX)} ${String(nextY)}`;
        length += Math.hypot(nextX - x, nextY - y);
        area += triangle([0, 0], [x, y], [nextX, nextY]);
      }
      reach(nextX, nextY);
      x = nextX;
      y = nextY;
    }
    const geometry = count * (curves ? WEIGHT.cubic : WEIGHT.line);
    const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
    // A straight edge shows at most the image's diagonal; a cubic, three convex pieces, at most
    // three times its perimeter.
    const visible = count * (curves ? 12 : Math.SQRT2);
    return {
      id,
      markup: `<path id="${id}" d="${data}"${this.dash(id)}/>`,
      measure: (dashes) => shape(geometry, length, count, WEIGHT.tiledDash, dashes),
      paint: (_, reading) => filled(Math.min(area, boxArea), visible, length, count, box, reading),
      clipped: false,
    };
  }

  private basicShape(id: string): Item {
    if (this.random() < 0.5) {
      const [width, height] = [1 + this.integer(100), 1 + this.integer(100)];
      return {
        id,
        markup: `<rect id="${id}" width="${String(width)}" height="${String(height)}"${this.dash(id)}/>`,
        measure: (dashes) => shape(4 * WEIGHT.line, 2 * (width + height), 4, WEIGHT.dash, dashes),
        clipped: false,
        paint: (_, reading) =>
          filled(
            width * height,
            4,
            2 * (width + height),
            4,
            { minX: 0, minY: 0, maxX: width, maxY: height },
            reading,
          ),
      };
    }
    const radius = 1 + this.integer(50);
    return {
      id,
      markup: `<circle id="${id}" r="${String(radius)}"${this.dash(id)}/>`,
      measure: (dashes) =>
        shape(4 * WEIGHT.cubic, 2 * Math.PI * radius, 4, WEIGHT.tiledDash, dashes),
      clipped: false,
      paint: (_, reading) =>
        filled(
          Math.PI * radius * radius,
          4,
          2 * Math.PI * radius,
          4,
          { minX: -radius, minY: -radius, maxX: radius, maxY: radius },
          reading,
        ),
    };
  }

  private use(target: Item): Omit<Item, "id"> {
    return {
      markup: `<use href="#${target.id}"/>`,
      measure: (dashes) =>
        add({ cost: WEIGHT.element, masks: 0, depth: 0 }, target.measure(dashes)),
      paint: (clipping, reading) => target.paint(clipping, reading),
      clipped: target.clipped,
    };
  }

  private applied(mask: Item | undefined): {
    markup: string;
    measure: (dashes: Dashes) => Measure;
    /** What applying it to a box paints; a mask inside a clip path is not applied. */
    paint: (box: Box, clipping: boolean, reading: Reading) => number;
  } {
    if (mask === undefined) return { markup: "", measure: () => NONE, paint: () => 0 };
    const clip = mask.id.startsWith("c");
    return {
      markup: ` ${clip ? "clip-path" : "mask"}="url(#${mask.id})"`,
      measure: (dashes) => {
        const inside = mask.measure(dashes);
        return {
          cost: WEIGHT.mask + inside.cost,
          masks: 1 + inside.masks,
          depth: 1 + inside.depth,
        };
      },
      paint: (box, clipping, reading) => {
        if (clipping && !clip) return 0;
        // A clip path holding a shape clipped or masked in turn is drawn as an alpha mask.
        const weight = clip ? (mask.clipped ? PAINT.alphaMask : PAINT.clip) : PAINT.mask;
        return share(box) * weight + mask.paint(clip, reading).overdraw;
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
      measure: (dashes) =>
        [applied.measure(dashes), ...uses.map((use) => use.measure(dashes))].reduce(add, {
          cost: WEIGHT.element + (layer ? WEIGHT.layer : 0),
          masks: 0,
          depth: 0,
        }),
      paint: (clipping, reading) => {
        const painted = uses.map((use) => use.paint(clipping, reading));
        const box = painted.map((part) => part.box).reduce(joined, NO_BOX);
        const own = painted.reduce((total, part) => total + part.overdraw, 0);
        const opacity = layer && !clipping ? share(box) * PAINT.layer : 0;
        return { overdraw: own + opacity + applied.paint(box, clipping, reading), box };
      },
      clipped: mask !== undefined,
    };
  }

  private mask(id: string): Item {
    // A mask mostly holds a plain shape, the way masks are drawn, so its chain is not cut short by
    // the reference depth limit.
    const content = this.use(this.pick(this.random() < 0.8 ? this.shapes : this.items));
    // Mostly the newest mask, so chains of masks inside masks grow long.
    const inner = this.random() < 0.9 ? this.masks.at(-1) : undefined;
    const applied = this.applied(inner);
    if (id.startsWith("c")) {
      // A clip path holds its shape directly: a group there, or a clip path or mask on what it
      // holds, would be dropped.
      return {
        id,
        markup: `<clipPath id="${id}">${content.markup}</clipPath>`,
        measure: (dashes) =>
          add({ cost: WEIGHT.element, masks: 0, depth: 0 }, content.measure(dashes)),
        paint: (clipping, reading) => content.paint(clipping, reading),
        clipped: content.clipped,
      };
    }
    return {
      id,
      markup: `<mask id="${id}"><g${applied.markup}>${content.markup}</g></mask>`,
      measure: (dashes) =>
        add(
          { cost: 2 * WEIGHT.element, masks: 0, depth: 0 },
          add(applied.measure(dashes), content.measure(dashes)),
        ),
      // What its content paints each time it is applied.
      paint: (clipping, reading) => {
        const inside = content.paint(clipping, reading);
        return {
          overdraw: inside.overdraw + applied.paint(inside.box, clipping, reading),
          box: inside.box,
        };
      },
      clipped: false,
    };
  }

  build(): {
    svg: string;
    expected: Measure;
    loosest: Measure;
    overdraw: number;
    loosestOverdraw: number;
  } {
    let definitions = "";
    for (let index = 0; index < 2 + this.integer(4); index += 1) {
      const item =
        this.random() < 0.6 ? this.path(`s${String(index)}`) : this.basicShape(`s${String(index)}`);
      this.items.push(item);
      this.shapes.push(item);
      definitions += item.markup;
    }
    // Masks come before the groups that apply them; some logos have none, some a long chain.
    const maskCount = this.integer(this.pick([1, 4, 8, 12]));
    for (let index = 0; index < maskCount; index += 1) {
      // Fewer clip paths than masks: a clip path, holding a shape directly, ends a chain of masks.
      const mask = this.mask(`${this.random() < 0.2 ? "c" : "m"}${String(index)}`);
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
    // A definition nothing drawn refers to is dropped, and its dash array with it.
    const markups = new Map([...this.items, ...this.masks].map((item) => [item.id, item.markup]));
    const reached = new Set<string>();
    const pending = roots.map((root) => root.markup);
    for (let markup = pending.pop(); markup !== undefined; markup = pending.pop()) {
      for (const [, id = ""] of markup.matchAll(/#([a-z0-9]+)/g)) {
        if (reached.has(id)) continue;
        reached.add(id);
        pending.push(markups.get(id) ?? "");
      }
    }
    const used = [...this.dashing].filter(([id]) => reached.has(id)).map(([, dashing]) => dashing);
    const dashing = {
      period: used.length === 0 ? 0 : Math.min(...used.map(({ period }) => period)),
      perPeriod: used.length === 0 ? 0 : Math.max(...used.map(({ perPeriod }) => perPeriod)),
    };
    const measured = (reading: Reading): Measure =>
      roots
        .map((root) => root.measure({ ...dashing, reading }))
        .reduce(add, { cost: WEIGHT.element, masks: 0, depth: 0 });
    const painted = (reading: Reading): number =>
      roots.reduce((total, root) => total + root.paint(false, reading).overdraw, 0);
    return {
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${definitions}</defs>` +
        `${roots.map((root) => root.markup).join("")}</svg>`,
      expected: measured(EXACT),
      loosest: measured(LOOSEST),
      overdraw: painted(EXACT),
      loosestOverdraw: painted(LOOSEST),
    };
  }
}

describe("the drawing cost, over random graphs of definitions", () => {
  it("lies within a hair of a model of its own over 3,000 random logos, and refuses only what goes over a limit within that hair", () => {
    const seed = 15_002;
    const random = seeded(seed);
    const outcomes = new Map<string, number>();
    for (let run = 0; run < 3_000; run += 1) {
      const where = `seed ${String(seed)}, run ${String(run)}`;
      const { svg, expected, loosest, overdraw, loosestOverdraw } = new LogoGraph(random).build();
      const result = sanitiseSvgLogo(svg);
      const over = {
        "masks-too-deep": expected.depth > SVG_LOGO_LIMITS.maskDepth,
        "too-many-masks": expected.masks > SVG_LOGO_LIMITS.maskApplications,
        "drawing-too-costly": expected.cost > SVG_LOGO_LIMITS.drawingCost,
        "overdraw-too-large": overdraw > SVG_LOGO_LIMITS.overdraw,
      };
      const overLoosest = {
        ...over,
        "drawing-too-costly": loosest.cost > SVG_LOGO_LIMITS.drawingCost,
        "overdraw-too-large": loosestOverdraw > SVG_LOGO_LIMITS.overdraw,
      };
      const outcome = result.ok ? "accepted" : (result.errors[0]?.code ?? "none");
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
      if (result.ok) {
        expectSettledLogo(result.svg, where);
        expect(result.drawingCost, where).toBeGreaterThanOrEqual(expected.cost);
        expect(result.drawingCost, where).toBeLessThanOrEqual(loosest.cost);
        expect(result.overdraw, where).toBeGreaterThanOrEqual(overdraw - 1e-9);
        expect(result.overdraw, where).toBeLessThanOrEqual(loosestOverdraw + 1e-9);
        expect(Object.values(over).some(Boolean), where).toBe(false);
        continue;
      }
      expect(["expansion-too-large", "reference-too-deep", ...Object.keys(over)], where).toContain(
        outcome,
      );
      // Refused for its element count or reference depth, it may be over the others too; refused
      // for one limit, it may be over those checked after it.
      if (outcome in over) {
        expect(overLoosest[outcome as keyof typeof overLoosest], where).toBe(true);
      }
    }
    // Every outcome turns up often enough to mean something.
    for (const outcome of [
      "accepted",
      "drawing-too-costly",
      "too-many-masks",
      "masks-too-deep",
      "overdraw-too-large",
    ]) {
      expect(outcomes.get(outcome) ?? 0, outcome).toBeGreaterThan(50);
    }
  }, 120_000);
});
