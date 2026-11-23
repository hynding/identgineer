import type { CleanElement } from "./filter-svg-tree.ts";
import { STYLE_PROPERTIES, SVG_ELEMENT_RULES, type SvgElementName } from "./svg-allowlist.ts";
import { EMPTY_BOX, measureShape, type SvgBox, userUnits } from "./svg-drawing-cost.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import { IDENTITY, mapBox, type Matrix, multiply, parseTransform } from "./svg-matrix.ts";
import type { Removals } from "./svg-removals.ts";
import { SVG_GRAMMARS, type SvgValue } from "./svg-values.ts";

/** What a clip path may draw with: a `use` in one draws only these, and nothing else. */
const BASIC_SHAPES: ReadonlySet<string> = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);

/** The attributes that give a shape its geometry: all it keeps but its id, transform and paint. */
function geometryAttributes(name: SvgElementName): readonly string[] {
  return SVG_ELEMENT_RULES[name].attributes.filter(
    (attribute) =>
      attribute !== "id" && attribute !== "transform" && !STYLE_PROPERTIES.has(attribute),
  );
}

function textOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "text" in value ? value.text : undefined;
}

function referenceOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "reference" in value ? value.reference : undefined;
}

/** A value built here, read through the same grammar as any input so the output stays canonical. */
function kept(name: string, text: string, limits: SvgLogoLimits): SvgValue {
  const grammar = SVG_GRAMMARS[name];
  const value = grammar?.(text, limits);
  if (value === undefined) {
    throw new SvgLogoRejection(
      "number-out-of-range",
      "has a clip path that cannot be written as a mask within the number limits",
    );
  }
  return value;
}

function element(
  name: SvgElementName,
  attributes: Map<string, SvgValue>,
  children: CleanElement[],
  offset: number,
): CleanElement {
  return { name, qualified: name, attributes, children, text: "", offset };
}

/** One shape a clip path draws: the shape, the `use` that draws it if any, and how it is filled. */
interface ClipShape {
  readonly shape: CleanElement;
  readonly use: CleanElement | undefined;
  readonly clipRule: string;
}

/** The viewport a percentage is taken of: the root's view box, the only viewport a logo has. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** The larger side, which bounds any percentage from above. */
  readonly base: number;
}

function grow(box: SvgBox, by: number): SvgBox {
  return { minX: box.minX - by, minY: box.minY - by, maxX: box.maxX + by, maxY: box.maxY + by };
}

function union(left: SvgBox, right: SvgBox): SvgBox {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

const SCALE = 1e6;

class ClipPathRewriter {
  private readonly parents = new Map<CleanElement, CleanElement>();
  private readonly rewritten = new Set<string>();

  private readonly root: CleanElement;
  private readonly ids: ReadonlyMap<string, CleanElement>;
  private readonly viewport: Viewport;
  private readonly limits: SvgLogoLimits;
  private readonly removals: Removals;

  constructor(
    root: CleanElement,
    ids: ReadonlyMap<string, CleanElement>,
    viewport: Viewport,
    limits: SvgLogoLimits,
    removals: Removals,
  ) {
    this.root = root;
    this.ids = ids;
    this.viewport = viewport;
    this.limits = limits;
    this.removals = removals;
    const stack = [root];
    for (let parent = stack.pop(); parent !== undefined; parent = stack.pop()) {
      for (const child of parent.children) {
        this.parents.set(child, parent);
        stack.push(child);
      }
    }
  }

  run(): void {
    for (const clip of [...this.parents.keys()].filter((node) => node.name === "clipPath")) {
      this.settle(clip);
    }
    if (this.rewritten.size > 0) this.swapReferences();
  }

  /** A property as `element` inherits it from itself and what holds it in the document. */
  private inherited(element: CleanElement | undefined, name: string): string | undefined {
    for (let at = element; at !== undefined; at = this.parents.get(at)) {
      const value = textOf(at, name);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  /**
   * Keeps of a clip path only what it draws (a shape it ignores is dropped as `render-cost`, a
   * `use` of anything but a shape as `misplaced`), then rewrites it as a mask if it would make a
   * renderer combine shapes: when it draws more than one, or one clipped in turn.
   */
  private settle(clip: CleanElement): void {
    const shapes: ClipShape[] = [];
    const children: CleanElement[] = [];
    for (const child of clip.children) {
      if (child.name === "title" || child.name === "desc") {
        children.push(child);
        continue;
      }
      const drawn = this.clipShape(clip, child);
      if (drawn === undefined) continue;
      children.push(child);
      shapes.push(drawn);
    }
    clip.children = children;
    const clippedInTurn = shapes.some(({ shape }) => referenceOf(shape, "clip-path") !== undefined);
    if (shapes.length > 1 || clippedInTurn) this.rewrite(clip, shapes);
  }

  private clipShape(clip: CleanElement, child: CleanElement): ClipShape | undefined {
    let shape = child;
    let use: CleanElement | undefined;
    if (child.name === "use") {
      const reference = referenceOf(child, "href");
      const target = reference === undefined ? undefined : this.ids.get(reference);
      if (target === undefined || !BASIC_SHAPES.has(target.name)) {
        this.removals.add({ element: child.qualified }, "misplaced", child.offset);
        return undefined;
      }
      shape = target;
      use = child;
    }
    // A use passes its properties to its target, not the target's place in the document.
    const property = (name: string): string | undefined =>
      textOf(shape, name) ??
      (use === undefined ? undefined : textOf(use, name)) ??
      this.inherited(clip, name);
    const shown =
      textOf(child, "display") !== "none" &&
      textOf(shape, "display") !== "none" &&
      (property("visibility") ?? "visible") === "visible";
    if (!shown) {
      this.removals.add({ element: child.qualified }, "render-cost", child.offset);
      return undefined;
    }
    return { shape, use, clipRule: property("clip-rule") ?? "nonzero" };
  }

  /** A use's `x` or `y` in user units of what the clip path's content is drawn in. */
  private offset(use: CleanElement, name: "x" | "y", objectBox: boolean): number {
    const text = textOf(use, name);
    if (text === undefined) return 0;
    if (text.endsWith("%")) {
      const fraction = Number(text.slice(0, -1)) / 100;
      if (objectBox) return fraction;
      return fraction * (name === "x" ? this.viewport.width : this.viewport.height);
    }
    return userUnits(text, this.viewport.base);
  }

  /** The shape drawn bare in a mask, and the box it can cover in the mask's content units. */
  private copy(
    { shape, use, clipRule }: ClipShape,
    clipMatrix: Matrix,
    objectBox: boolean,
  ): { readonly drawn: CleanElement; readonly box: SvgBox } {
    const attributes = new Map<string, SvgValue>();
    let usesPercentages = false;
    for (const name of geometryAttributes(shape.name)) {
      const value = shape.attributes.get(name);
      if (value === undefined) continue;
      attributes.set(name, value);
      if ("text" in value && value.text.includes("%")) usesPercentages = true;
    }
    const own = textOf(shape, "transform");
    if (own !== undefined) attributes.set("transform", kept("transform", own, this.limits));
    attributes.set("fill", kept("fill", "#fff", this.limits));
    attributes.set("fill-opacity", kept("fill-opacity", "1", this.limits));
    attributes.set("fill-rule", kept("fill-rule", clipRule, this.limits));
    attributes.set("stroke", kept("stroke", "none", this.limits));
    const clipPath = shape.attributes.get("clip-path");
    if (clipPath !== undefined && "reference" in clipPath) attributes.set("clip-path", clipPath);
    attributes.set("visibility", kept("visibility", "visible", this.limits));
    let drawn = element(shape.name, attributes, [], shape.offset);
    let matrix = own === undefined ? IDENTITY : parseTransform(own);
    if (use !== undefined) {
      const placed = [textOf(use, "transform"), this.placement(use, objectBox)].filter(
        (part): part is string => part !== undefined,
      );
      // One group when the transform list stays within its limit, a group for each part if not.
      if (placed.length > 0 && !this.tooLong(placed)) drawn = this.group(placed.join(" "), drawn);
      else for (const part of [...placed].reverse()) drawn = this.group(part, drawn);
      matrix = multiply(placed.length === 0 ? IDENTITY : parseTransform(placed.join(" ")), matrix);
    }
    // A percentage resolves to between nothing and itself of the larger side, so the box with the
    // origin in it holds wherever it lands.
    const geometry = measureShape(shape, this.viewport.base)?.box ?? EMPTY_BOX;
    const local = usesPercentages
      ? union(geometry, { minX: 0, minY: 0, maxX: 0, maxY: 0 })
      : geometry;
    return { drawn, box: mapBox(multiply(clipMatrix, matrix), local) };
  }

  private placement(use: CleanElement, objectBox: boolean): string | undefined {
    const [x, y] = [this.offset(use, "x", objectBox), this.offset(use, "y", objectBox)];
    return x === 0 && y === 0 ? undefined : `translate(${String(x)} ${String(y)})`;
  }

  private tooLong(parts: readonly string[]): boolean {
    return SVG_GRAMMARS.transform?.(parts.join(" "), this.limits) === undefined;
  }

  private group(transform: string, child: CleanElement): CleanElement {
    return element(
      "g",
      new Map([["transform", kept("transform", transform, this.limits)]]),
      [child],
      child.offset,
    );
  }

  /** The clip path, replaced where it stands by an alpha mask of the same shapes under the same id. */
  private rewrite(clip: CleanElement, shapes: readonly ClipShape[]): void {
    const objectBox = textOf(clip, "clipPathUnits") === "objectBoundingBox";
    const transform = textOf(clip, "transform");
    const clipMatrix = transform === undefined ? IDENTITY : parseTransform(transform);
    const copies = shapes.map((shape) => this.copy(shape, clipMatrix, objectBox));
    const drawn = copies.map(({ drawn: copy }) => copy);
    const content =
      transform === undefined
        ? drawn
        : [
            element(
              "g",
              new Map([["transform", kept("transform", transform, this.limits)]]),
              drawn,
              clip.offset,
            ),
          ];
    const descriptive = clip.children.filter(
      (child) => child.name === "title" || child.name === "desc",
    );
    const attributes = new Map<string, SvgValue>();
    const id = clip.attributes.get("id");
    if (id !== undefined) attributes.set("id", id);
    this.region(copies.map(({ box }) => box).reduce(union, EMPTY_BOX), attributes);
    if (!objectBox) attributes.set("maskUnits", kept("maskUnits", "userSpaceOnUse", this.limits));
    else {
      attributes.set(
        "maskContentUnits",
        kept("maskContentUnits", "objectBoundingBox", this.limits),
      );
    }
    attributes.set("mask-type", kept("mask-type", "alpha", this.limits));
    // A clip path not displayed clips nothing, and a mask not displayed masks nothing.
    const display = clip.attributes.get("display");
    if (display !== undefined) attributes.set("display", display);
    const mask = element("mask", attributes, [...descriptive, ...content], clip.offset);
    const parent = this.parents.get(clip);
    if (parent === undefined) throw new Error("a clip path is the root");
    parent.children = parent.children.map((child) => (child === clip ? mask : child));
    this.parents.set(mask, parent);
    if (id !== undefined && "text" in id) this.rewritten.add(id.text);
    this.removals.add({ element: clip.qualified }, "rewritten", clip.offset);
  }

  /**
   * The mask's region: the box of every shape, grown by a tenth of its larger side all round so an
   * antialiased edge is never cut, rounded outwards to the six decimals a number keeps.
   */
  private region(box: SvgBox, attributes: Map<string, SvgValue>): void {
    const empty = box.minX > box.maxX;
    const shapes = empty ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : box;
    const margin = Math.max(shapes.maxX - shapes.minX, shapes.maxY - shapes.minY) / 10;
    const around = grow(shapes, margin);
    // Settled to a thousandth of the last decimal first, so 1.2000000000000002 stays 1.2.
    const settled = (value: number): number => Math.round(value * SCALE * 1000) / 1000;
    const x = Math.floor(settled(around.minX)) / SCALE;
    const y = Math.floor(settled(around.minY)) / SCALE;
    const width = Math.ceil(settled(around.maxX - x)) / SCALE;
    const height = Math.ceil(settled(around.maxY - y)) / SCALE;
    for (const [name, value] of [
      ["x", x],
      ["y", y],
      ["width", width],
      ["height", height],
    ] as const) {
      attributes.set(name, kept(name, value.toFixed(6), this.limits));
    }
  }

  /**
   * Points everything that used a rewritten clip path at its mask instead. An element with a mask
   * of its own moves into a group that carries its id and transform (so a `use` of it, and where
   * it stands, are unchanged) and applies the new mask around its own.
   */
  private swapReferences(): void {
    const stack = [this.root];
    for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
      stack.push(...node.children);
      const clip = node.attributes.get("clip-path");
      if (clip === undefined || !("reference" in clip) || !this.rewritten.has(clip.reference)) {
        continue;
      }
      node.attributes.delete("clip-path");
      if (referenceOf(node, "mask") === undefined) {
        node.attributes.set("mask", clip);
        continue;
      }
      const parent = this.parents.get(node);
      if (parent === undefined) {
        // The root's clip path and mask work in the space around it, in CSS pixels, which no
        // group inside it stands for at every size the logo is drawn.
        throw new SvgLogoRejection(
          "drawing-too-costly",
          "has a clip path of more than one shape on a root with a mask of its own, which cannot be written as a mask",
          node.offset,
        );
      }
      const moved = new Map<string, SvgValue>();
      for (const name of ["id", "transform"]) {
        const value = node.attributes.get(name);
        if (value === undefined) continue;
        moved.set(name, value);
        node.attributes.delete(name);
      }
      moved.set("mask", clip);
      const wrapper = element("g", moved, [node], node.offset);
      parent.children = parent.children.map((child) => (child === node ? wrapper : child));
      this.parents.set(wrapper, parent);
      this.parents.set(node, wrapper);
    }
  }
}

/**
 * Leaves no clip path that makes a renderer combine shapes, which can take minutes however few
 * they are: a clip path of more than one shape, or of one clipped in turn, becomes an alpha mask
 * of the same shapes, opaque, under the same id, and what used it uses the mask (see the README).
 * A clip path of one shape stays as it is. What a clip path ignores is dropped from it.
 */
export function rewriteClipPaths(
  root: CleanElement,
  ids: ReadonlyMap<string, CleanElement>,
  viewport: Viewport,
  limits: SvgLogoLimits,
  removals: Removals,
): void {
  new ClipPathRewriter(root, ids, viewport, limits, removals).run();
}
