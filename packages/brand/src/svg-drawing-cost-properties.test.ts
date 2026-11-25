import { describe, expect, it } from "vitest";
import { sanitiseSvgLogo, sanitiseSvgLogoWithLimits } from "./sanitise-svg-logo.ts";
import { seeded } from "./seeded-random.ts";
import { SVG_DRAWING_WEIGHTS as WEIGHT } from "./svg-drawing-cost.ts";
import { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
import { SVG_OVERDRAW_WEIGHTS as PAINT } from "./svg-overdraw.ts";
import { expectSettledLogo } from "./test-support.ts";

// Random logos built as a graph of definitions (shapes, groups of uses, masks) whose drawing cost
// and overdraw are worked out here from the graph itself, by a model written apart from the
// sanitiser's, and compared with what the sanitiser measured or why it refused. In the first run
// nothing is transformed or stroked and every paint is the default solid black, so each definition
// paints the same wherever it is used: its overdraw is its own, drawn as itself or as part of a
// clip path. In the second, shapes, groups, uses and what masks hold are stroked, capped, dashed and
// transformed, each instance inheriting its own paint, so that every instance's dashes are charged
// again for the tiles of a large image its stroke's box can touch; the overdraw is left unlimited
// there, and not modelled. The sanitiser bounds lengths and dash periods over every reading
// Chromium can make of the numbers, a hair from the exact ones, so its measure must lie between the
// model read exactly and the model read with every length a hair longer and every period a hair
// shorter.

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

/**
 * How the model reads a length of so many segments, a dash period, and the extent of a box drawn
 * (which only rounding can move, by far less than a millionth).
 */
interface Reading {
  readonly length: (length: number, segments: number) => number;
  readonly period: (period: number) => number;
  readonly extent: (extent: number) => number;
}

const EXACT: Reading = {
  length: (length) => length,
  period: (period) => period,
  extent: (extent) => extent - 1e-6,
};
/** Longer and shorter than any reading the sanitiser bounds: a ten-thousandth, and a few hundredths
 * a segment, more than single precision can move a number of this view box. */
const LOOSEST: Reading = {
  length: (length, segments) => length * (1 + 1e-4) + segments * 0.05,
  period: (period) => period * (1 - 1e-4),
  extent: (extent) => extent + 1e-6,
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
  /** What working dashes out again for the tiles of a large image added to the cost. */
  readonly tiles: number;
  /** The instances charged for round caps wider than a tile. */
  readonly wideRound: number;
}

/** How a shape is dashed: the length of one repeat, and the dashes in it. */
interface Dashes {
  readonly period: number;
  readonly perPeriod: number;
}

/**
 * What an instance is drawn with: the scale its transforms add up to on each axis (they only scale
 * and move, so a box's extent only scales), and the paint it inherits; inside a clip path, only
 * its coverage is drawn.
 */
interface Context {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly stroke: boolean;
  readonly width: number;
  readonly cap: string;
  readonly dashes: Dashes | undefined;
  readonly clipping: boolean;
}

/** What the root gives, and what a mask's content inherits from its place among the definitions. */
const ROOT: Context = {
  scaleX: 1,
  scaleY: 1,
  stroke: false,
  width: 1,
  cap: "butt",
  dashes: undefined,
  clipping: false,
};

/** An element's attributes of paint and transform, and what they make of the context it is in. */
interface Presentation {
  readonly markup: string;
  /** Its own dash array, if it has one. */
  readonly dashes: Dashes | undefined;
  readonly apply: (context: Context) => Context;
}

const PLAIN: Presentation = { markup: "", dashes: undefined, apply: (context) => context };

/**
 * An element, for what dash array may reach it: its own, what it passes one on to (what it holds
 * or draws), and the masks and clip paths it refers to, which keep them but inherit nothing.
 */
interface Node {
  readonly dashes: Dashes | undefined;
  readonly next: readonly Node[];
  readonly refers: readonly Node[];
}

interface Item {
  readonly id: string;
  readonly markup: string;
  readonly node: Node;
  readonly measure: (reading: Reading, context: Context) => Measure;
  /** What it paints, drawn as itself or (`clipping`) as coverage inside a clip path. */
  readonly paint: (clipping: boolean, reading: Reading) => Paint;
  /** Whether it has a clip path or mask of its own; for a clip path, whether what it holds has. */
  readonly clipped: boolean;
}

const NONE: Measure = { cost: 0, masks: 0, depth: 0, tiles: 0, wideRound: 0 };

/** What an element other than a shape costs on its own. */
function element(cost: number): Measure {
  return { ...NONE, cost };
}

function add(left: Measure, right: Measure): Measure {
  return {
    cost: left.cost + right.cost,
    masks: left.masks + right.masks,
    depth: Math.max(left.depth, right.depth),
    tiles: left.tiles + right.tiles,
    wideRound: left.wideRound + right.wideRound,
  };
}

/** The dashes along a shape of one subpath, which may start the pattern afresh: one more repeat. */
function dashCount(
  dashes: Dashes | undefined,
  length: number,
  segments: number,
  reading: Reading,
): number {
  if (dashes === undefined) return 0;
  return (
    (Math.ceil(reading.length(length, segments) / reading.period(dashes.period)) + 1) *
    dashes.perPeriod
  );
}

/** Tiles across a large image, counted as eight by eight. */
const TILES = 8;

/**
 * The share of the tiles a stroked box can touch: the columns and rows it spans, one more each
 * where it straddles two. The stroke reaches half its width out, four times over at the default
 * miter join.
 */
function tileShare(box: Box, context: Context, reading: Reading): number {
  const reach = 2 * context.width;
  const span = (extent: number, scale: number): number =>
    Math.min(TILES, Math.ceil((reading.extent((extent + 2 * reach) * scale) / SIDE) * TILES) + 1);
  return (
    (span(box.maxX - box.minX, context.scaleX) * span(box.maxY - box.minY, context.scaleY)) /
    (TILES * TILES)
  );
}

/** Whether round caps are wider, as drawn, than a tile. */
function wideRound(context: Context): boolean {
  return (
    context.cap === "round" &&
    context.width * Math.max(context.scaleX, context.scaleY) > SIDE / TILES
  );
}

function tiledWeight(context: Context): number {
  if (context.cap === "round") {
    return wideRound(context) ? WEIGHT.tiledDash.wideRound : WEIGHT.tiledDash.round;
  }
  return context.cap === "square" ? WEIGHT.tiledDash.square : WEIGHT.tiledDash.butt;
}

/** A shape's outline: its geometry's weight, its length in segments, its box. */
interface Outline {
  readonly geometry: number;
  readonly length: number;
  readonly segments: number;
  readonly box: Box;
  /** One horizontal or vertical line, or a rectangle: dashes culled to each tile. */
  readonly straightRun: boolean;
}

const WIDTHS = [0, 0.5, 1, 3, 7, 13, 20, 40];
const CAPS = ["butt", "round", "square"];
const SCALES = [0.5, 2, 3];

class LogoGraph {
  private readonly random: () => number;
  private readonly stroked: boolean;
  private readonly items: Item[] = [];
  private readonly masks: Item[] = [];
  private readonly shapes: Item[] = [];
  /** The elements a dash array can be inherited by, and the densest dashing in the logo. */
  private reached = new Set<Node>();
  private densest: Dashes | undefined;

  constructor(random: () => number, stroked: boolean) {
    this.random = random;
    this.stroked = stroked;
  }

  private integer(below: number): number {
    return Math.floor(this.random() * below);
  }

  private pick<T>(items: readonly T[]): T {
    return items[this.integer(items.length)] as T;
  }

  private node(
    dashes: Dashes | undefined,
    next: readonly Node[],
    refers: readonly Node[] = [],
  ): Node {
    return { dashes, next, refers };
  }

  private dash(): { readonly markup: string; readonly dashes: Dashes | undefined } {
    if (this.random() >= (this.stroked ? 0.35 : 0.2)) return { markup: "", dashes: undefined };
    const length = this.stroked ? (1 + this.integer(200)) / 20 : (1 + this.integer(5000)) / 1000;
    // An odd array repeats twice over.
    const entries = this.pick([1, 2, 3, 64]);
    const odd = entries % 2 === 1;
    return {
      markup: ` stroke-dasharray="${Array.from({ length: entries }, () => String(length)).join(" ")}"`,
      dashes: { period: (odd ? 2 : 1) * entries * length, perPeriod: odd ? entries : entries / 2 },
    };
  }

  /**
   * An element's paint and, on a use, transform: unstroked, only a shape's own dash array; stroked,
   * any of a stroke or none, a width, caps, a dash array, and a transform that scales and moves.
   */
  private presentation(kind: "shape" | "group" | "use"): Presentation {
    if (!this.stroked) {
      if (kind !== "shape") return PLAIN;
      const { markup, dashes } = this.dash();
      return {
        markup,
        dashes,
        apply: (context) => (dashes === undefined ? context : { ...context, dashes }),
      };
    }
    let markup = "";
    const own: { -readonly [Key in keyof Context]?: Context[Key] } = {};
    let scaleX = 1;
    let scaleY = 1;
    if (kind === "use" && this.random() < 0.4) {
      const form = this.integer(3);
      [scaleX, scaleY] = [this.pick(SCALES), this.pick(SCALES)];
      if (form === 0) scaleY = scaleX;
      const scale = scaleX === scaleY ? String(scaleX) : `${String(scaleX)} ${String(scaleY)}`;
      const move =
        form === 2 ? `translate(${String(this.integer(50))} ${String(this.integer(50))}) ` : "";
      markup += ` transform="${move}scale(${scale})"`;
    }
    if (this.random() < 0.5) {
      own.stroke = this.random() < 0.85;
      markup += ` stroke="${own.stroke ? "#000" : "none"}"`;
    }
    if (this.random() < 0.4) {
      own.width = this.pick(WIDTHS);
      markup += ` stroke-width="${String(own.width)}"`;
    }
    if (this.random() < 0.4) {
      own.cap = this.pick(CAPS);
      markup += ` stroke-linecap="${own.cap}"`;
    }
    const dashing = this.dash();
    if (dashing.dashes !== undefined) own.dashes = dashing.dashes;
    return {
      markup: markup + dashing.markup,
      dashes: dashing.dashes,
      apply: (context) => ({
        ...context,
        ...own,
        scaleX: context.scaleX * scaleX,
        scaleY: context.scaleY * scaleY,
      }),
    };
  }

  /**
   * A shape's cost in this instance: its geometry, and its dashes once, by its own dash array, or,
   * where one can be inherited, at the densest dashing in the logo; and, stroked and dashed by what
   * it has or inherits here, those dashes again for the tiles its stroke's box can touch.
   */
  private shape(
    outline: Outline,
    node: Node,
    presentation: Presentation,
  ): (reading: Reading, context: Context) => Measure {
    return (reading, context) => {
      const here = presentation.apply(context);
      const { geometry, length, segments } = outline;
      const dashing = node.dashes ?? (this.reached.has(node) ? this.densest : undefined);
      const cost =
        WEIGHT.shape + geometry + dashCount(dashing, length, segments, reading) * WEIGHT.dash;
      const charged =
        !here.clipping &&
        here.stroke &&
        here.width > 0 &&
        here.dashes !== undefined &&
        !outline.straightRun;
      const tiles = charged
        ? dashCount(here.dashes, length, segments, reading) *
          tileShare(outline.box, here, reading) *
          tiledWeight(here)
        : 0;
      return {
        ...NONE,
        cost: cost + tiles,
        tiles,
        wideRound: charged && wideRound(here) ? 1 : 0,
      };
    };
  }

  /** A shape's item: its markup, with its paint, and its node. */
  private shapeItem(id: string, markup: string, outline: Outline, paint: Item["paint"]): Item {
    const presentation = this.presentation("shape");
    const node = this.node(presentation.dashes, []);
    return {
      id,
      markup: markup.replace("/>", `${presentation.markup}/>`),
      node,
      measure: this.shape(outline, node, presentation),
      paint,
      clipped: false,
    };
  }

  private path(id: string): Item {
    const kind = this.random();
    if (kind < 0.2) return this.axisPath(id);
    const curves = kind < 0.45;
    // Stroked and dashed, a shorter path, so that more logos are within the drawing cost.
    const count = 1 + this.integer((curves ? 400 : 3000) / (this.stroked ? 10 : 1));
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
    return this.shapeItem(
      id,
      `<path id="${id}" d="${data}"/>`,
      { geometry, length, segments: count, box, straightRun: false },
      (_, reading) => filled(Math.min(area, boxArea), visible, length, count, box, reading),
    );
  }

  /**
   * A path of H and V segments, each of some length: one segment alone is a line whose dashes
   * Chromium culls to each tile of a large image; any more, whichever way they turn, are not.
   */
  private axisPath(id: string): Item {
    const count = 1 + (this.random() < 0.3 ? 0 : this.integer(300));
    let data = "M0 0";
    let x = 0;
    let y = 0;
    let length = 0;
    let area = 0;
    let box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    for (let index = 0; index < count; index += 1) {
      const horizontal = this.random() < 0.5;
      const from = horizontal ? x : y;
      // Anywhere on the axis but where the pen already is.
      const to = (from + 1 + this.integer(99)) % 100;
      const [nextX, nextY] = horizontal ? [to, y] : [x, to];
      data += `${horizontal ? "H" : "V"}${String(to)}`;
      length += Math.abs(to - from);
      area += triangle([0, 0], [x, y], [nextX, nextY]);
      box = joined(box, { minX: nextX, minY: nextY, maxX: nextX, maxY: nextY });
      x = nextX;
      y = nextY;
    }
    const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
    return this.shapeItem(
      id,
      `<path id="${id}" d="${data}"/>`,
      { geometry: count * WEIGHT.line, length, segments: count, box, straightRun: count === 1 },
      (_, reading) =>
        filled(Math.min(area, boxArea), count * Math.SQRT2, length, count, box, reading),
    );
  }

  private basicShape(id: string): Item {
    if (this.random() < 0.5) {
      const [width, height] = [1 + this.integer(100), 1 + this.integer(100)];
      const box = { minX: 0, minY: 0, maxX: width, maxY: height };
      return this.shapeItem(
        id,
        `<rect id="${id}" width="${String(width)}" height="${String(height)}"/>`,
        {
          geometry: 4 * WEIGHT.line,
          length: 2 * (width + height),
          segments: 4,
          box,
          straightRun: true,
        },
        (_, reading) => filled(width * height, 4, 2 * (width + height), 4, box, reading),
      );
    }
    const radius = 1 + this.integer(50);
    const box = { minX: -radius, minY: -radius, maxX: radius, maxY: radius };
    return this.shapeItem(
      id,
      `<circle id="${id}" r="${String(radius)}"/>`,
      {
        geometry: 4 * WEIGHT.cubic,
        length: 2 * Math.PI * radius,
        segments: 4,
        box,
        straightRun: false,
      },
      (_, reading) => filled(Math.PI * radius * radius, 4, 2 * Math.PI * radius, 4, box, reading),
    );
  }

  private use(target: Item): Omit<Item, "id"> {
    const presentation = this.presentation("use");
    return {
      markup: `<use href="#${target.id}"${presentation.markup}/>`,
      node: this.node(presentation.dashes, [target.node]),
      measure: (reading, context) =>
        add(element(WEIGHT.element), target.measure(reading, presentation.apply(context))),
      paint: (clipping, reading) => target.paint(clipping, reading),
      clipped: target.clipped,
    };
  }

  private applied(mask: Item | undefined): {
    markup: string;
    measure: (reading: Reading, context: Context) => Measure;
    /** What applying it to a box paints; a mask inside a clip path is not applied. */
    paint: (box: Box, clipping: boolean, reading: Reading) => number;
  } {
    if (mask === undefined) return { markup: "", measure: () => NONE, paint: () => 0 };
    const clip = mask.id.startsWith("c");
    return {
      markup: ` ${clip ? "clip-path" : "mask"}="url(#${mask.id})"`,
      // What a mask holds inherits from the mask's own place, drawn in the space of what it is
      // applied to; what a clip path holds is drawn as coverage, as is a mask inside a clip path.
      measure: (reading, context) => {
        const inside = mask.measure(reading, {
          ...ROOT,
          scaleX: context.scaleX,
          scaleY: context.scaleY,
          clipping: clip || context.clipping,
        });
        return {
          ...inside,
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
    const presentation = this.presentation("group");
    return {
      id,
      markup: `<g id="${id}"${layer ? ' opacity="0.5"' : ""}${presentation.markup}${applied.markup}>${uses.map((use) => use.markup).join("")}</g>`,
      node: this.node(
        presentation.dashes,
        uses.map((use) => use.node),
        mask === undefined ? [] : [mask.node],
      ),
      measure: (reading, context) => {
        const here = presentation.apply(context);
        return [
          applied.measure(reading, here),
          ...uses.map((use) => use.measure(reading, here)),
        ].reduce(add, element(WEIGHT.element + (layer ? WEIGHT.layer : 0)));
      },
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
        node: this.node(undefined, [content.node]),
        measure: (reading, context) =>
          add(element(WEIGHT.element), content.measure(reading, context)),
        paint: (clipping, reading) => content.paint(clipping, reading),
        clipped: content.clipped,
      };
    }
    // The group a mask holds its content in may carry paint for it to inherit.
    const presentation = this.presentation("group");
    const group = this.node(
      presentation.dashes,
      [content.node],
      inner === undefined ? [] : [inner.node],
    );
    return {
      id,
      markup: `<mask id="${id}"><g${presentation.markup}${applied.markup}>${content.markup}</g></mask>`,
      node: this.node(undefined, [group]),
      measure: (reading, context) => {
        const here = presentation.apply(context);
        return add(
          element(2 * WEIGHT.element),
          add(applied.measure(reading, here), content.measure(reading, here)),
        );
      },
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

  /**
   * Which elements a dash array can be inherited by: from each element with one of its own, on
   * through what it holds or draws, as far as an element with one of its own; and the shortest
   * period of any dash array with the most dashes a repeat of any. Only what the logo draws counts:
   * the sanitiser drops a definition nothing refers to.
   */
  private settleDashing(roots: readonly Node[]): void {
    const kept = new Set(roots);
    const keeping = [...roots];
    for (let node = keeping.pop(); node !== undefined; node = keeping.pop()) {
      for (const next of [...node.next, ...node.refers]) {
        if (kept.has(next)) continue;
        kept.add(next);
        keeping.push(next);
      }
    }
    const dashed = [...kept].filter((node) => node.dashes !== undefined);
    const stack = [...dashed];
    for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
      for (const next of node.next) {
        if (next.dashes !== undefined || this.reached.has(next)) continue;
        this.reached.add(next);
        stack.push(next);
      }
    }
    this.densest =
      dashed.length === 0
        ? undefined
        : {
            period: Math.min(...dashed.map((node) => node.dashes?.period ?? Infinity)),
            perPeriod: Math.max(...dashed.map((node) => node.dashes?.perPeriod ?? 0)),
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
    this.settleDashing(roots.map((root) => root.node));
    const measured = (reading: Reading): Measure =>
      roots.map((root) => root.measure(reading, ROOT)).reduce(add, element(WEIGHT.element));
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
      const { svg, expected, loosest, overdraw, loosestOverdraw } = new LogoGraph(
        random,
        false,
      ).build();
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

  it("charges every instance's dashes again for the tiles of a large image, by a model of its own, over 3,000 random logos stroked, capped, dashed and transformed through uses, groups and masks", () => {
    const seed = 15_003;
    const random = seeded(seed);
    const limits = { ...SVG_LOGO_LIMITS, overdraw: Infinity };
    const outcomes = new Map<string, number>();
    let tiled = 0;
    let wide = 0;
    for (let run = 0; run < 3_000; run += 1) {
      const where = `seed ${String(seed)}, run ${String(run)}`;
      const { svg, expected, loosest } = new LogoGraph(random, true).build();
      const result = sanitiseSvgLogoWithLimits(svg, undefined, limits);
      const over = {
        "masks-too-deep": expected.depth > limits.maskDepth,
        "too-many-masks": expected.masks > limits.maskApplications,
        "drawing-too-costly": expected.cost > limits.drawingCost,
      };
      const outcome = result.ok ? "accepted" : (result.errors[0]?.code ?? "none");
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
      if (result.ok) {
        // Settled, but under these limits: its paint may be over the usual overdraw.
        const again = sanitiseSvgLogoWithLimits(result.svg, undefined, limits);
        expect(again.ok && again.svg, `${where}: a fixed point`).toBe(result.svg);
        expect(result.drawingCost, where).toBeGreaterThanOrEqual(expected.cost);
        expect(result.drawingCost, where).toBeLessThanOrEqual(Math.ceil(loosest.cost));
        expect(Object.values(over).some(Boolean), where).toBe(false);
        if (expected.tiles > 0) tiled += 1;
        if (expected.wideRound > 0) wide += 1;
        continue;
      }
      expect(["expansion-too-large", "reference-too-deep", ...Object.keys(over)], where).toContain(
        outcome,
      );
      if (outcome === "drawing-too-costly") {
        expect(loosest.cost, where).toBeGreaterThan(limits.drawingCost);
      }
    }
    for (const outcome of ["accepted", "drawing-too-costly"]) {
      expect(outcomes.get(outcome) ?? 0, outcome).toBeGreaterThan(50);
    }
    // Accepted logos charged for their tiles, some for round caps wider than a tile.
    expect(tiled).toBeGreaterThan(300);
    expect(wide).toBeGreaterThan(50);
  }, 120_000);
});
