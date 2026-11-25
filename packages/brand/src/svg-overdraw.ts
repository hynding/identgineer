import type { CleanElement } from "./filter-svg-tree.ts";
import { GRADIENTS } from "./svg-allowlist.ts";
import {
  boxArea,
  dashCount,
  dashingOf,
  drawingTooCostly,
  EMPTY_BOX,
  type Geometry,
  measureShape,
  SVG_DRAWING_WEIGHTS,
  type SvgBox,
  userUnits,
} from "./svg-drawing-cost.ts";
import {
  bounded,
  determinant,
  IDENTITY,
  invert,
  mapBox,
  type Matrix,
  multiply,
  parseTransform,
  stretch,
} from "./svg-matrix.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import type { SvgValue } from "./svg-values.ts";

/**
 * What painting costs, in units of the square on the larger side of the view box painted once in
 * a solid colour: the image a logo fills when shown in a square. Measured in Chromium as a full
 * raster at 600 CSS pixels and at 2000 with a device scale factor of 2, each weight the larger of
 * the two once the limit is shared out as a second at 600 and 1.75 seconds at 2000 (see the
 * README). A gradient weighs by how many stops it has, rounded up to the next tier, and more when
 * it is translucent, as a solid colour does.
 */
export const SVG_OVERDRAW_WEIGHTS = Object.freeze({
  solid: 1,
  translucent: 4,
  gradient: Object.freeze({ 2: 6, 4: 13, 8: 14, 16: 15, 32: 19, 64: 23 }),
  translucentGradient: Object.freeze({ 2: 14, 4: 19, 8: 19, 16: 21, 32: 22, 64: 26 }),
  /** Group opacity: a layer the size of what the group draws, composited once. */
  layer: 16,
  /** A luminance mask, over the box of what it masks, on top of what its content paints. */
  mask: 64,
  alphaMask: 32,
  /** A clip path, over the box of what it clips, on top of the coverage of what it holds. */
  clip: 1,
  /** An edge as long as the larger side of the view box, filled or as coverage. */
  edge: 0.03,
  /**
   * A path whose edges, laid end to end, cross the image this many times costs twice as much per
   * edge, and more beyond: each row of pixels holds about that many edges, and a crowded row costs
   * more than in proportion to them.
   */
  edgesPerRow: 800,
  /**
   * An edge of a stroke's outline along a curve, as so many straight ones: a large image is
   * rasterised in tiles, and Chromium strokes a curve again for every tile its box touches,
   * measured as an image 2000 CSS pixels square at twice the density.
   */
  curvedStroke: 4,
});

/** The most of a convex outline a square image shows: its perimeter, in sides. */
const PERIMETER = 4;

/**
 * What edges as long as `sides` sides of the image cost, within one path, with `crossings` of them
 * known to share a row (else as many as their length could put on every row).
 */
function edgeCost(sides: number, crossings = 0): number {
  const onARow = Math.max(sides, crossings);
  return sides * SVG_OVERDRAW_WEIGHTS.edge * (1 + (onARow / SVG_OVERDRAW_WEIGHTS.edgesPerRow) ** 2);
}

const STOP_TIERS = [2, 4, 8, 16, 32, 64] as const;
type StopTier = (typeof STOP_TIERS)[number];

/** Definitions: drawn only where something refers to them. */
const NOT_DRAWN_IN_PLACE: ReadonlySet<string> = new Set([
  "defs",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
]);

function grow(box: SvgBox, by: number): SvgBox {
  if (box.minX > box.maxX) return box;
  return { minX: box.minX - by, minY: box.minY - by, maxX: box.maxX + by, maxY: box.maxY + by };
}

function union(a: SvgBox, b: SvgBox): SvgBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** What paint the drawing inherits at an element (SVG 1.1 defaults at the root). */
interface Inherited {
  readonly fill: SvgValue;
  readonly fillOpacity: number;
  readonly stroke: SvgValue;
  readonly strokeOpacity: number;
  readonly strokeWidth: number;
  readonly strokeLinejoin: string;
  readonly strokeMiterlimit: number;
  readonly strokeLinecap: string;
  readonly strokeDasharray: string;
}

const ROOT_INHERITED: Inherited = {
  fill: { text: "black" },
  fillOpacity: 1,
  stroke: { text: "none" },
  strokeOpacity: 1,
  strokeWidth: 1,
  strokeLinejoin: "miter",
  strokeMiterlimit: 4,
  strokeLinecap: "butt",
  strokeDasharray: "none",
};

function textOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "text" in value ? value.text : undefined;
}

function numberOf(element: CleanElement, name: string): number | undefined {
  const text = textOf(element, name);
  return text === undefined ? undefined : Number(text);
}

/**
 * Walks every element as it is drawn, references expanded, and charges what it paints (see
 * `SVG_OVERDRAW_WEIGHTS`). Each instance is charged on its own, with its own transform and inherited
 * paint, so nothing is assumed about how a definition is used; the expansion limit, checked first,
 * bounds the walk. An instance is never charged more than the whole image: what lies outside it is
 * not painted. Areas are fractions of the square on the larger side of the view box.
 */
class OverdrawWalk {
  private readonly ids: ReadonlyMap<string, CleanElement>;
  private readonly parents: ReadonlyMap<CleanElement, CleanElement>;
  private readonly limits: SvgLogoLimits;
  private readonly square: number;
  private readonly side: number;
  private readonly percentBase: number;
  private readonly geometries = new Map<CleanElement, Geometry | undefined>();
  total = 0;
  /** The drawing cost, to which working each instance's dashes out again for each tile adds. */
  drawingCost: number;

  constructor(
    root: CleanElement,
    ids: ReadonlyMap<string, CleanElement>,
    limits: SvgLogoLimits,
    viewBox: readonly number[],
    drawingCost: number,
  ) {
    this.ids = ids;
    this.limits = limits;
    this.drawingCost = drawingCost;
    this.side = Math.max(viewBox[2] ?? 1, viewBox[3] ?? 1);
    this.square = this.side * this.side;
    this.percentBase = Math.max(this.side, 1);
    const parents = new Map<CleanElement, CleanElement>();
    const stack = [root];
    for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
      for (const child of element.children) {
        parents.set(child, element);
        stack.push(child);
      }
    }
    this.parents = parents;
  }

  /** Draws `element` under `matrix`; returns the box of what it painted, in view box units. */
  draw(element: CleanElement, matrix: Matrix, inherited: Inherited, clipping: boolean): SvgBox {
    if (textOf(element, "display") === "none") return EMPTY_BOX;
    const transform = textOf(element, "transform");
    let local = transform === undefined ? matrix : multiply(matrix, parseTransform(transform));
    const paint = clipping ? inherited : this.inherit(element, inherited);
    let box = EMPTY_BOX;
    const opacity = numberOf(element, "opacity") ?? 1;
    const geometry = this.geometry(element);
    if (element.name === "use") {
      local = multiply(local, [1, 0, 0, 1, this.length(element, "x"), this.length(element, "y")]);
      const target = this.target(element, "href");
      if (target !== undefined) box = this.draw(target, local, paint, clipping);
      if (opacity < 1 && !clipping) this.charge(this.share(box) * SVG_OVERDRAW_WEIGHTS.layer);
    } else if (geometry !== undefined) {
      box = this.shape(geometry, element.name, local, paint, clipping, opacity);
    } else {
      for (const child of element.children) {
        if (!NOT_DRAWN_IN_PLACE.has(child.name)) {
          box = union(box, this.draw(child, local, paint, clipping));
        }
      }
      if (opacity < 1 && !clipping) this.charge(this.share(box) * SVG_OVERDRAW_WEIGHTS.layer);
    }
    this.applyClip(element, local, box);
    if (!clipping) this.applyMask(element, local, box);
    return box;
  }

  private shape(
    geometry: Geometry,
    name: string,
    matrix: Matrix,
    paint: Inherited,
    clipping: boolean,
    opacity: number,
  ): SvgBox {
    const scale = determinant(matrix);
    const edges = Math.min(
      geometry.visibleOutline,
      (stretch(matrix) * geometry.length) / this.side,
    );
    const fillArea = (): number =>
      Math.min(scale * geometry.area, boxArea(mapBox(matrix, geometry.box))) / this.square;
    // SVG never fills a line.
    const fillable = name !== "line";
    if (clipping) {
      // A clip path is drawn as coverage: its shapes' geometry, never their paint or stroke.
      if (fillable) {
        this.charge(Math.min(1, fillArea()) * SVG_OVERDRAW_WEIGHTS.solid + edgeCost(edges));
      }
      return mapBox(matrix, geometry.box);
    }
    const fills = fillable && !isNone(paint.fill);
    const strokes = !isNone(paint.stroke) && paint.strokeWidth > 0;
    // Opacity on a shape with one paint is folded into that paint; with two it takes a layer.
    const layered = opacity < 1 && fills && strokes;
    const alpha = layered ? 1 : opacity;
    let box = mapBox(matrix, geometry.box);
    if (fills) {
      this.charge(
        Math.min(1, fillArea()) * this.paintWeight(paint.fill, paint.fillOpacity * alpha) +
          edgeCost(edges),
      );
    }
    if (strokes) {
      // A stroke reaches half its width out, a miter join up to the miter limit times that, a
      // square cap the diagonal; within that, it covers no more than its outline times its width,
      // and a join or a cap at each vertex.
      const width = paint.strokeWidth;
      const reach =
        (width / 2) *
        (paint.strokeLinejoin === "miter"
          ? Math.max(paint.strokeMiterlimit, Math.SQRT2)
          : Math.SQRT2);
      const outer = grow(geometry.box, reach);
      const pieces = this.strokePieces(geometry, paint.strokeDasharray);
      const local = Math.min(
        boxArea(outer),
        geometry.length * width +
          (geometry.segments + 1) * (2 * reach) ** 2 +
          // A dash's caps can reach past it, a square cap's by a square of the width in all.
          (pieces.dashed ? pieces.count * width * width : 0),
      );
      const area = Math.min(scale * local, boxArea(mapBox(matrix, outer))) / this.square;
      const shown = (length: number): number =>
        Math.min(PERIMETER, (stretch(matrix) * length) / this.side);
      // A curve is stroked whole, however little of it the image shows.
      const curved = (stretch(matrix) * geometry.curvedLength) / this.side;
      this.charge(
        Math.min(1, area) * this.paintWeight(paint.stroke, paint.strokeOpacity * alpha) +
          // A stroke's outline runs along both sides of the path, round each join (counted at
          // every segment), and across both ends of every subpath or dash. Dashes closer together
          // than the stroke is wide put the caps of all of them on the rows a level stretch of the
          // path covers.
          edgeCost(
            2 * edges +
              geometry.segments * shown(joinLength(paint)) +
              2 * pieces.count * shown(capLength(paint)),
            pieces.spacing < width ? 2 * pieces.count : 0,
          ) +
          // Along its curves, stroked again for each tile of a large image: work in proportion to
          // their length, which no crowding of rows adds to.
          2 * (SVG_OVERDRAW_WEIGHTS.curvedStroke - 1) * curved * SVG_OVERDRAW_WEIGHTS.edge,
      );
      box = mapBox(matrix, outer);
      // Every dash is worked out again for each tile of a large image the stroke's box touches,
      // but along one horizontal or vertical line or round a rectangle, culled to the tile.
      if (pieces.dashed && !geometry.straightRun) {
        this.drawingCost +=
          pieces.count * this.tileShare(box) * tiledDashWeight(paint.strokeLinecap);
        // Written so that a cost that is not a number is refused too.
        if (!(this.drawingCost <= this.limits.drawingCost)) throw drawingTooCostly(this.limits);
      }
    }
    if (layered) this.charge(this.share(box) * SVG_OVERDRAW_WEIGHTS.layer);
    return box;
  }

  /**
   * The pieces a stroke is drawn in: its subpaths, or, dashed, every dash, each subpath starting
   * the pattern afresh (so up to one more repeat each).
   */
  private strokePieces(
    geometry: Geometry,
    dasharray: string,
  ): { readonly count: number; readonly dashed: boolean; readonly spacing: number } {
    const dashing = dashingOf(dasharray);
    if (dashing.period === 0) {
      return { count: geometry.subpaths, dashed: false, spacing: Infinity };
    }
    return {
      count: dashCount(geometry, dashing),
      dashed: true,
      // How far apart the dashes start, on average.
      spacing: dashing.period / dashing.perPeriod,
    };
  }

  /**
   * A clip path applied to `box`: its area, and its content drawn as coverage each time. Every
   * clip path kept holds one shape, which clips by its outline: the sanitiser writes any other as
   * an alpha mask, charged as a mask.
   */
  private applyClip(element: CleanElement, matrix: Matrix, box: SvgBox): void {
    const clip = this.target(element, "clip-path");
    if (clip === undefined) return;
    this.charge(this.share(box) * SVG_OVERDRAW_WEIGHTS.clip);
    const content = this.contentMatrix(clip, "clipPathUnits", matrix, box);
    for (const child of clip.children) this.draw(child, content, ROOT_INHERITED, true);
    this.applyClip(clip, content, box);
  }

  /** A mask applied to `box`: its area, and its content painted each time. */
  private applyMask(element: CleanElement, matrix: Matrix, box: SvgBox): void {
    const mask = this.target(element, "mask");
    if (mask === undefined) return;
    const weight =
      textOf(mask, "mask-type") === "alpha"
        ? SVG_OVERDRAW_WEIGHTS.alphaMask
        : SVG_OVERDRAW_WEIGHTS.mask;
    this.charge(this.share(box) * weight);
    const content = this.contentMatrix(mask, "maskContentUnits", matrix, box);
    const inherited = this.inheritedAt(mask);
    for (const child of mask.children) this.draw(child, content, inherited, false);
  }

  /**
   * The space a clip path's or a mask's content is drawn in: the user space of what refers to it,
   * or, in bounding box units, the box of what it is applied to (the drawn box stands in for the
   * element's own: both are no smaller than what it paints); then the definition's own transform,
   * which only a clip path keeps.
   */
  private contentMatrix(
    definition: CleanElement,
    units: string,
    matrix: Matrix,
    box: SvgBox,
  ): Matrix {
    const transform = textOf(definition, "transform");
    const own = transform === undefined ? IDENTITY : parseTransform(transform);
    if (textOf(definition, units) !== "objectBoundingBox") return multiply(matrix, own);
    if (box.minX > box.maxX) return [0, 0, 0, 0, 0, 0];
    const unitBox = bounded([box.maxX - box.minX, 0, 0, box.maxY - box.minY, box.minX, box.minY]);
    // The box is in the root's space and the transform acts in the element's: carry it over.
    const back = invert(matrix);
    if (transform === undefined || back === undefined) return unitBox;
    return multiply(multiply(multiply(matrix, own), back), unitBox);
  }

  /** What a mask's content inherits: from the mask's own ancestors, not from what it masks. */
  private inheritedAt(element: CleanElement): Inherited {
    const chain: CleanElement[] = [];
    for (let at: CleanElement | undefined = element; at !== undefined; at = this.parents.get(at)) {
      chain.unshift(at);
    }
    return chain.reduce((inherited, at) => this.inherit(at, inherited), ROOT_INHERITED);
  }

  private inherit(element: CleanElement, from: Inherited): Inherited {
    const width = textOf(element, "stroke-width");
    return {
      fill: element.attributes.get("fill") ?? from.fill,
      fillOpacity: numberOf(element, "fill-opacity") ?? from.fillOpacity,
      stroke: element.attributes.get("stroke") ?? from.stroke,
      strokeOpacity: numberOf(element, "stroke-opacity") ?? from.strokeOpacity,
      strokeWidth: width === undefined ? from.strokeWidth : this.length(element, "stroke-width"),
      strokeLinejoin: textOf(element, "stroke-linejoin") ?? from.strokeLinejoin,
      strokeMiterlimit: numberOf(element, "stroke-miterlimit") ?? from.strokeMiterlimit,
      strokeLinecap: textOf(element, "stroke-linecap") ?? from.strokeLinecap,
      strokeDasharray: textOf(element, "stroke-dasharray") ?? from.strokeDasharray,
    };
  }

  /** A length attribute in user units. */
  private length(element: CleanElement, name: string): number {
    return userUnits(textOf(element, name), this.percentBase);
  }

  /** A shape's geometry, read once however often the shape is drawn. */
  private geometry(element: CleanElement): Geometry | undefined {
    if (!this.geometries.has(element)) {
      this.geometries.set(element, measureShape(element, this.percentBase));
    }
    return this.geometries.get(element);
  }

  private paintWeight(paint: SvgValue, opacity: number): number {
    if ("reference" in paint) {
      const gradient = this.ids.get(paint.reference);
      if (gradient === undefined || !GRADIENTS.has(gradient.name)) return 0;
      const stops = this.stopsOf(gradient);
      const tier: StopTier = STOP_TIERS.find((count) => count >= stops.length) ?? 64;
      const translucent =
        opacity < 1 || stops.some((stop) => (numberOf(stop, "stop-opacity") ?? 1) < 1);
      return translucent
        ? SVG_OVERDRAW_WEIGHTS.translucentGradient[tier]
        : SVG_OVERDRAW_WEIGHTS.gradient[tier];
    }
    if (paint.text === "none") return 0;
    return opacity < 1 || paint.text === "transparent"
      ? SVG_OVERDRAW_WEIGHTS.translucent
      : SVG_OVERDRAW_WEIGHTS.solid;
  }

  /** A gradient's stops, or those it borrows through `href` when it has none of its own. */
  private stopsOf(gradient: CleanElement): CleanElement[] {
    let at: CleanElement | undefined = gradient;
    for (let step = 0; at !== undefined && step <= this.ids.size; step += 1) {
      const stops = at.children.filter((child) => child.name === "stop");
      if (stops.length > 0) return stops;
      at = this.target(at, "href");
    }
    return [];
  }

  private target(element: CleanElement, attribute: string): CleanElement | undefined {
    const value = element.attributes.get(attribute);
    return value !== undefined && "reference" in value ? this.ids.get(value.reference) : undefined;
  }

  /**
   * The most of the tiles of a large image a box can touch, as a share of them all: the columns and
   * rows of `TILES` by `TILES` it spans, and one more of each where it straddles, wherever it lies.
   */
  private tileShare(box: SvgBox): number {
    if (box.minX > box.maxX) return 0;
    const span = (from: number, to: number): number =>
      Math.min(TILES, Math.ceil(((to - from) / this.side) * TILES) + 1);
    return (span(box.minX, box.maxX) * span(box.minY, box.maxY)) / (TILES * TILES);
  }

  /** The share of the image a box covers, at most all of it. */
  private share(box: SvgBox): number {
    return Math.min(1, boxArea(box) / this.square);
  }

  private charge(amount: number): void {
    this.total += amount;
    // Written so that a total that is not a number is refused too.
    if (!(this.total <= this.limits.overdraw)) {
      throw new SvgLogoRejection(
        "overdraw-too-large",
        `would paint more than ${String(this.limits.overdraw)} times its view box (see SVG_OVERDRAW_WEIGHTS)`,
      );
    }
  }
}

/**
 * Tiles across a large image, for the share a dashed stroke's box touches: Chromium rasterises an
 * image 2000 CSS pixels square at twice the density in tiles of 256 device pixels, about 16 across;
 * counted as 8, each of twice that side, so a box is never found to touch fewer than it does.
 */
const TILES = 8;

/** What a dash weighs for each tile its stroke is worked out again in, by its caps. */
function tiledDashWeight(cap: string): number {
  const weights = SVG_DRAWING_WEIGHTS.tiledDash;
  return cap === "round" ? weights.round : cap === "square" ? weights.square : weights.butt;
}

/** The outline a join adds at most: a miter's two sides, half a turn round, or a bevel's width. */
function joinLength(paint: Inherited): number {
  const width = paint.strokeWidth;
  if (paint.strokeLinejoin === "round") return (Math.PI * width) / 2;
  if (paint.strokeLinejoin === "miter") return Math.max(paint.strokeMiterlimit, 1) * width;
  return width;
}

/** The outline across one end of a subpath or dash: straight, half a turn, or a square's sides. */
function capLength(paint: Inherited): number {
  const width = paint.strokeWidth;
  if (paint.strokeLinecap === "round") return (Math.PI * width) / 2;
  if (paint.strokeLinecap === "square") return 2 * width;
  return width;
}

function isNone(paint: SvgValue): boolean {
  return "text" in paint && paint.text === "none";
}

/**
 * Charges what painting a logo costs, every reference expanded, refusing it past
 * `limits.overdraw`, and adds to `drawingCost` (what the expansion measured) what working each
 * instance's dashes out again for the tiles of a large image costs, refusing it past
 * `limits.drawingCost`. Run after the expansion limits, which bound the walk. Returns the overdraw
 * and the drawing cost, rounded up.
 */
export function measureOverdraw(
  root: CleanElement,
  ids: ReadonlyMap<string, CleanElement>,
  limits: SvgLogoLimits,
  drawingCost: number,
): { readonly overdraw: number; readonly drawingCost: number } {
  const viewBox = (textOf(root, "viewBox") ?? "0 0 1 1").split(" ").map(Number);
  const walk = new OverdrawWalk(root, ids, limits, viewBox, drawingCost);
  walk.draw(root, IDENTITY, ROOT_INHERITED, false);
  if (!Number.isFinite(walk.total)) throw new Error("the overdraw is not a finite number");
  const total = Math.ceil(walk.drawingCost);
  if (!(total <= limits.drawingCost)) throw drawingTooCostly(limits);
  return { overdraw: walk.total, drawingCost: total };
}
