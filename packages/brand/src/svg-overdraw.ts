import type { CleanElement } from "./filter-svg-tree.ts";
import { GRADIENTS } from "./svg-allowlist.ts";
import {
  boxArea,
  dashCount,
  dashingOf,
  EMPTY_BOX,
  type Geometry,
  measureShape,
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
  product,
  stretch,
  transformFunctions,
} from "./svg-matrix.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import { RoundingPrecision, valueError } from "./svg-rounding-precision.ts";
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
  /** How far rounding moved the stroke width, dash offset and each dash length, in user units. */
  readonly strokeWidthError: number;
  readonly dashOffsetError: number;
  readonly dashArrayError: number;
}

/** The numbers that place what a shape or a `use` draws, in its own user space. */
const PLACING = [
  "d",
  "points",
  "x",
  "y",
  "width",
  "height",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "x1",
  "y1",
  "x2",
  "y2",
] as const;

/** The numbers that place a gradient, in the space its units give. */
const GRADIENT_PLACING = ["x1", "y1", "x2", "y2", "cx", "cy", "r", "fx", "fy", "fr"] as const;

/** A gradient's vector and radii by default, in either of its units. */
const GRADIENT_DEFAULTS: Readonly<Record<string, string>> = {
  x1: "0",
  y1: "0",
  x2: "100%",
  y2: "0",
  r: "50%",
  fr: "0",
};

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
  strokeWidthError: 0,
  dashOffsetError: 0,
  dashArrayError: 0,
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
  private readonly limit: number;
  private readonly square: number;
  private readonly side: number;
  private readonly percentBase: number;
  private readonly geometries = new Map<CleanElement, Geometry | undefined>();
  private readonly precision: RoundingPrecision;
  total = 0;

  constructor(
    root: CleanElement,
    ids: ReadonlyMap<string, CleanElement>,
    limits: SvgLogoLimits,
    viewBox: readonly number[],
  ) {
    this.ids = ids;
    this.limit = limits.overdraw;
    this.side = Math.max(viewBox[2] ?? 1, viewBox[3] ?? 1);
    this.square = this.side * this.side;
    this.percentBase = Math.max(this.side, 1);
    this.precision = new RoundingPrecision(viewBox);
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

  /**
   * Draws `element` under `matrix`; returns the box of what it painted, in view box units. `moved`
   * is how far rounding has already moved what it draws, in device pixels (see
   * `RoundingPrecision`).
   */
  draw(
    element: CleanElement,
    matrix: Matrix,
    inherited: Inherited,
    clipping: boolean,
    moved: number,
  ): SvgBox {
    if (textOf(element, "display") === "none") return EMPTY_BOX;
    const transform = textOf(element, "transform");
    let local = transform === undefined ? matrix : multiply(matrix, parseTransform(transform));
    const paint = clipping ? inherited : this.inherit(element, inherited);
    // The root's width and height size the image, not what is drawn in it.
    const placing = element.name === "svg" ? ["viewBox"] : PLACING;
    const here =
      moved +
      this.precision.transform(element.attributes.get("transform"), matrix) +
      this.precision.shift(this.precision.errorOf(element, placing, this.percentBase), local);
    this.precision.check(here);
    let box = EMPTY_BOX;
    const opacity = numberOf(element, "opacity") ?? 1;
    const geometry = this.geometry(element);
    if (element.name === "use") {
      local = multiply(local, [1, 0, 0, 1, this.length(element, "x"), this.length(element, "y")]);
      const target = this.target(element, "href");
      if (target !== undefined) box = this.draw(target, local, paint, clipping, here);
      if (opacity < 1 && !clipping) this.charge(this.share(box) * SVG_OVERDRAW_WEIGHTS.layer);
    } else if (geometry !== undefined) {
      box = this.shape(geometry, element.name, local, paint, clipping, opacity, here);
    } else {
      for (const child of element.children) {
        if (!NOT_DRAWN_IN_PLACE.has(child.name)) {
          box = union(box, this.draw(child, local, paint, clipping, here));
        }
      }
      if (opacity < 1 && !clipping) this.charge(this.share(box) * SVG_OVERDRAW_WEIGHTS.layer);
    }
    this.applyClip(element, local, box, here);
    if (!clipping) this.applyMask(element, local, box, here);
    return box;
  }

  private shape(
    geometry: Geometry,
    name: string,
    matrix: Matrix,
    paint: Inherited,
    clipping: boolean,
    opacity: number,
    moved: number,
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
    if (fills) this.precision.check(moved + this.gradientShift(paint.fill, geometry.box, matrix));
    if (strokes)
      this.precision.check(moved + this.gradientShift(paint.stroke, geometry.box, matrix));
    // A stroke width rounded to zero shows no stroke where the original showed one.
    if (!isNone(paint.stroke)) {
      this.precision.check(moved + this.precision.shift(strokeError(geometry, paint), matrix));
    }
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
          ),
      );
      box = mapBox(matrix, outer);
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
  private applyClip(element: CleanElement, matrix: Matrix, box: SvgBox, moved: number): void {
    const clip = this.target(element, "clip-path");
    if (clip === undefined) return;
    this.charge(this.share(box) * SVG_OVERDRAW_WEIGHTS.clip);
    const content = this.contentMatrix(clip, "clipPathUnits", matrix, box);
    // The clip path's own transform comes after the space of what it clips, in either units.
    const here = moved + this.precision.transform(clip.attributes.get("transform"), matrix);
    this.precision.check(here);
    for (const child of clip.children) this.draw(child, content, ROOT_INHERITED, true, here);
    this.applyClip(clip, content, box, here);
  }

  /** A mask applied to `box`: its area, and its content painted each time. */
  private applyMask(element: CleanElement, matrix: Matrix, box: SvgBox, moved: number): void {
    const mask = this.target(element, "mask");
    if (mask === undefined) return;
    const weight =
      textOf(mask, "mask-type") === "alpha"
        ? SVG_OVERDRAW_WEIGHTS.alphaMask
        : SVG_OVERDRAW_WEIGHTS.mask;
    this.charge(this.share(box) * weight);
    const content = this.contentMatrix(mask, "maskContentUnits", matrix, box);
    const inherited = this.inheritedAt(mask);
    const bounding = textOf(mask, "maskUnits") !== "userSpaceOnUse";
    const region = bounding ? this.boxMatrix(box) : matrix;
    const here =
      moved +
      this.precision.shift(
        this.precision.errorOf(
          mask,
          ["x", "y", "width", "height"],
          bounding ? 1 : this.percentBase,
        ),
        region ?? matrix,
      );
    this.precision.check(here);
    for (const child of mask.children) this.draw(child, content, inherited, false, here);
  }

  /** The matrix taking the unit square onto `box`, or `undefined` for an empty box. */
  private boxMatrix(box: SvgBox): Matrix | undefined {
    if (box.minX > box.maxX) return undefined;
    return [box.maxX - box.minX, 0, 0, box.maxY - box.minY, box.minX, box.minY];
  }

  /**
   * How far rounding moves a gradient `paint` paints a shape with, drawn under `matrix` with the
   * box `box` in its own space: its transform, the numbers placing its vector, and its stops'
   * offsets, each moving a colour along the vector by its change times the vector's length.
   */
  private gradientShift(paint: SvgValue, box: SvgBox, matrix: Matrix): number {
    if (!("reference" in paint)) return 0;
    const first = this.ids.get(paint.reference);
    if (first === undefined || !GRADIENTS.has(first.name)) return 0;
    const chain = this.gradientChain(first);
    const own = (name: string): SvgValue | undefined =>
      chain.find((at) => at.attributes.has(name))?.attributes.get(name);
    const units = own("gradientUnits");
    const bounding = !(units !== undefined && "text" in units && units.text === "userSpaceOnUse");
    const space = bounding ? this.boxMatrix(box) : IDENTITY;
    // A gradient in the units of an empty or flat box paints nothing.
    if (space === undefined || space[0] === 0 || space[3] === 0) return 0;
    const base = product(matrix, space);
    const transform = own("gradientTransform");
    const percentBase = bounding ? 1 : this.percentBase;
    const placed =
      transform !== undefined && "text" in transform
        ? transformFunctions(transform.text).reduce(product, base)
        : base;
    const at = (name: string): number => {
      const value = own(name);
      const written = value !== undefined && "text" in value ? value.text : GRADIENT_DEFAULTS[name];
      return userUnits(written, percentBase);
    };
    const vector =
      first.name === "linearGradient"
        ? Math.hypot(at("x2") - at("x1"), at("y2") - at("y1"))
        : at("r") + at("fr");
    const placing = Math.max(
      0,
      ...chain.map((gradient) => this.precision.errorOf(gradient, GRADIENT_PLACING, percentBase)),
    );
    // A vector or radius rounded to nothing paints the last colour everywhere: no small shift.
    const radius = first.name === "linearGradient" ? vector : at("r");
    if (radius === 0 && placing > 0) return Infinity;
    const offsets = Math.max(
      0,
      ...this.stopsOf(first).map((stop) => valueError(stop.attributes.get("offset"), 1)),
    );
    return (
      this.precision.transform(transform, base) +
      this.precision.shift(placing + offsets * vector, placed)
    );
  }

  /** A gradient and those it borrows from through `href`, in order. */
  private gradientChain(gradient: CleanElement): CleanElement[] {
    const chain: CleanElement[] = [];
    for (
      let at: CleanElement | undefined = gradient;
      at !== undefined && chain.length <= this.ids.size && !chain.includes(at);
      at = this.target(at, "href")
    ) {
      chain.push(at);
    }
    return chain;
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
      strokeWidthError: this.errorAt(element, "stroke-width", from.strokeWidthError),
      dashOffsetError: this.errorAt(element, "stroke-dashoffset", from.dashOffsetError),
      dashArrayError: this.errorAt(element, "stroke-dasharray", from.dashArrayError),
    };
  }

  /** The rounding of `name` where `element` sets it, else what it inherits. */
  private errorAt(element: CleanElement, name: string, inherited: number): number {
    const value = element.attributes.get(name);
    return value === undefined ? inherited : valueError(value, this.percentBase);
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

  /** The share of the image a box covers, at most all of it. */
  private share(box: SvgBox): number {
    return Math.min(1, boxArea(box) / this.square);
  }

  private charge(amount: number): void {
    this.total += amount;
    // Written so that a total that is not a number is refused too.
    if (!(this.total <= this.limit)) {
      throw new SvgLogoRejection(
        "overdraw-too-large",
        `would paint more than ${String(this.limit)} times its view box (see SVG_OVERDRAW_WEIGHTS)`,
      );
    }
  }
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

/**
 * How far rounding moves a stroke's edges and dashes, in its user units: its width and dash offset
 * by their change, and each dash by the change of every length before it, repeat after repeat.
 */
function strokeError(geometry: Geometry, paint: Inherited): number {
  const { period } = dashingOf(paint.strokeDasharray);
  if (period === 0) return paint.strokeWidthError;
  // An odd list is read twice over in each repeat; every subpath starts the pattern afresh.
  const lengths = 2 * paint.strokeDasharray.split(" ").length;
  const repeats = Math.ceil(geometry.length / period) + geometry.subpaths;
  return paint.strokeWidthError + paint.dashOffsetError + paint.dashArrayError * lengths * repeats;
}

function isNone(paint: SvgValue): boolean {
  return "text" in paint && paint.text === "none";
}

/**
 * Charges what painting a logo costs, every reference expanded, refusing it past
 * `limits.overdraw`. Run after the expansion limits, which bound the walk. Returns the overdraw.
 */
export function measureOverdraw(
  root: CleanElement,
  ids: ReadonlyMap<string, CleanElement>,
  limits: SvgLogoLimits,
): number {
  const viewBox = (textOf(root, "viewBox") ?? "0 0 1 1").split(" ").map(Number);
  const walk = new OverdrawWalk(root, ids, limits, viewBox);
  walk.draw(root, IDENTITY, ROOT_INHERITED, false, 0);
  if (!Number.isFinite(walk.total)) throw new Error("the overdraw is not a finite number");
  return walk.total;
}
