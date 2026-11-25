import type { CleanElement } from "./filter-svg-tree.ts";
import { freshIds } from "./fresh-ids.ts";
import { STYLE_PROPERTIES, SVG_ELEMENT_RULES, type SvgElementName } from "./svg-allowlist.ts";
import { EMPTY_BOX, measureShape, type SvgBox, userUnits } from "./svg-drawing-cost.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import { IDENTITY, mapBox, type Matrix, multiply, parseTransform } from "./svg-matrix.ts";
import type { Removals } from "./svg-removals.ts";
import { SVG_GRAMMARS, type SvgValue, writtenText } from "./svg-values.ts";

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

/** The attributes that may refer to another element. */
const REFERRING = ["href", "fill", "stroke", "clip-path", "mask"] as const;

/** The attributes that give a shape its geometry: all it keeps but its id, transform and paint. */
function geometryAttributes(name: SvgElementName): readonly string[] {
  return SVG_ELEMENT_RULES[name].attributes.filter(
    (attribute) =>
      attribute !== "id" &&
      attribute !== "href" &&
      attribute !== "transform" &&
      !STYLE_PROPERTIES.has(attribute),
  );
}

function textOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "text" in value ? value.text : undefined;
}

/** A value as it is written out: as given, where it was given. */
function writtenOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "text" in value ? writtenText(value) : undefined;
}

function referenceOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "reference" in value ? value.reference : undefined;
}

function isDescriptive(element: CleanElement): boolean {
  return element.name === "title" || element.name === "desc";
}

/** A value built here, read through the same grammar as any input. */
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
  /** The child of the clip path: the shape itself, or the `use`. */
  readonly child: CleanElement;
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

/** A number read as a plain decimal in whole millionths, or `undefined` where it has a part smaller. */
function millionths(text: string): bigint | undefined {
  const match = /^(-?)(\d*)(?:\.(\d+))?$/.exec(text);
  if (match === null) throw new Error(`"${text}" is not a plain decimal`);
  const [, sign = "", whole = "", fraction = ""] = match;
  if (fraction.length > 6) return undefined;
  const value = BigInt(whole === "" ? "0" : whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  return sign === "-" ? -value : value;
}

/** Whole millionths as the shortest plain decimal. */
function decimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const fraction = (magnitude % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  const whole = (magnitude / 1_000_000n).toString();
  return `${sign}${whole}${fraction === "" ? "" : `.${fraction}`}`;
}

/** What a rewritten clip path's mask paints its shapes with, inherited by each of them. */
const MASK_PAINT = [
  ["fill", "#fff"],
  ["fill-opacity", "1"],
  ["fill-rule", "nonzero"],
  ["stroke", "none"],
  ["visibility", "visible"],
] as const;

class ClipPathRewriter {
  private readonly parents = new Map<CleanElement, CleanElement>();
  private readonly rewritten = new Set<string>();
  /** Every id something refers to. */
  private readonly referenced = new Set<string>();
  /** The bare copy made of each shape a `use` in a rewritten clip path draws, by its new id. */
  private readonly copies = new Map<CleanElement, string>();
  /** The box of each shape, measured once however often it is drawn. */
  private readonly boxes = new Map<CleanElement, SvgBox>();
  /** The definitions set beside each clip path, made when first needed. */
  private readonly besides = new Map<CleanElement, CleanElement>();
  private readonly nextId: () => string;

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
    this.nextId = freshIds(root);
    const stack = [root];
    for (let parent = stack.pop(); parent !== undefined; parent = stack.pop()) {
      for (const name of REFERRING) {
        const reference = referenceOf(parent, name);
        if (reference !== undefined) this.referenced.add(reference);
      }
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
   * Keeps of a clip path only what it draws (a shape it ignores is dropped as `render-cost`; one
   * holding a `use` of anything but a shape, which browsers draw differently, is emptied), then
   * rewrites it as a mask if it would make a renderer combine shapes: when it draws more than one,
   * or one clipped in turn, or is clipped itself.
   */
  private settle(clip: CleanElement): void {
    const drawing = clip.children.filter((child) => !isDescriptive(child));
    const descriptive = clip.children.filter(isDescriptive);
    if (drawing.some((child) => child.name === "use" && !BASIC_SHAPES.has(this.target(child)))) {
      // An empty clip path hides everything, so its own clip path changes nothing.
      if (clip.attributes.delete("clip-path")) {
        this.removals.add(
          { element: clip.qualified, attribute: "clip-path" },
          "render-cost",
          clip.offset,
        );
      }
      for (const child of drawing) {
        this.removals.add({ element: child.qualified }, "misplaced", child.offset);
        this.keepIfReferenced(child, clip);
      }
      clip.children = descriptive;
      return;
    }
    const shapes: ClipShape[] = [];
    for (const child of drawing) {
      const drawn = this.clipShape(clip, child);
      if (drawn === undefined) {
        this.removals.add({ element: child.qualified }, "render-cost", child.offset);
        this.keepIfReferenced(child, clip);
        continue;
      }
      shapes.push(drawn);
    }
    clip.children = clip.children.filter(
      (child) => isDescriptive(child) || shapes.some((shape) => shape.child === child),
    );
    const clipped =
      referenceOf(clip, "clip-path") !== undefined ||
      shapes.some(
        ({ child, shape }) =>
          referenceOf(child, "clip-path") !== undefined ||
          referenceOf(shape, "clip-path") !== undefined,
      );
    if (shapes.length > 1 || clipped) this.rewrite(clip, shapes);
  }

  private target(use: CleanElement): string {
    const reference = referenceOf(use, "href");
    return (reference === undefined ? undefined : this.ids.get(reference))?.name ?? "";
  }

  /** The shape a child of a clip path draws, or nothing when the clip path ignores it. */
  private clipShape(clip: CleanElement, child: CleanElement): ClipShape | undefined {
    const reference = child.name === "use" ? referenceOf(child, "href") : undefined;
    const use = child.name === "use" ? child : undefined;
    const shape = (reference === undefined ? undefined : this.ids.get(reference)) ?? child;
    // A use passes its properties to its target, not the target's place in the document.
    const property = (name: string): string | undefined =>
      textOf(shape, name) ??
      (use === undefined ? undefined : textOf(use, name)) ??
      this.inherited(clip, name);
    const shown =
      textOf(child, "display") !== "none" &&
      textOf(shape, "display") !== "none" &&
      (property("visibility") ?? "visible") === "visible";
    return shown ? { child, shape, use, clipRule: property("clip-rule") ?? "nonzero" } : undefined;
  }

  /**
   * A child leaving its clip path that something still refers to (a `use` elsewhere drawing it)
   * stays as a definition, with its id, paint and all, beside the clip path.
   */
  private keepIfReferenced(child: CleanElement, clip: CleanElement): void {
    const id = textOf(child, "id");
    if (id !== undefined && this.referenced.has(id)) this.beside(clip).children.push(child);
  }

  /** The `defs` set just before a clip path, for what must outlive it. */
  private beside(clip: CleanElement): CleanElement {
    const existing = this.besides.get(clip);
    if (existing !== undefined) return existing;
    const parent = this.parents.get(clip);
    if (parent === undefined) throw new Error("a clip path is the root");
    const definitions = element("defs", new Map(), [], clip.offset);
    const at = parent.children.indexOf(clip);
    parent.children.splice(at, 0, definitions);
    this.parents.set(definitions, parent);
    this.besides.set(clip, definitions);
    return definitions;
  }

  private box(shape: CleanElement): SvgBox {
    const known = this.boxes.get(shape);
    if (known !== undefined) return known;
    const geometry = measureShape(shape, this.viewport.base)?.box ?? EMPTY_BOX;
    // A percentage resolves to between nothing and itself of the larger side, so the box with the
    // origin in it holds wherever it lands.
    const usesPercentages = geometryAttributes(shape.name).some((name) =>
      textOf(shape, name)?.includes("%"),
    );
    const box = usesPercentages
      ? union(geometry, { minX: 0, minY: 0, maxX: 0, maxY: 0 })
      : geometry;
    this.boxes.set(shape, box);
    return box;
  }

  /** The shape's geometry and own transform, and the clip path that clips it in turn, bare. */
  private bare(shape: CleanElement): Map<string, SvgValue> {
    const attributes = new Map<string, SvgValue>();
    for (const name of [...geometryAttributes(shape.name), "transform", "clip-path"]) {
      const value = shape.attributes.get(name);
      if (value !== undefined) attributes.set(name, value);
    }
    return attributes;
  }

  /**
   * One bare copy of what a `use` in a clip path draws, made once for the whole document and set
   * beside the first clip path that needs it, so a use costs one element however large its target.
   * Its fill rule is its own clip rule, if it has one; otherwise it takes the use's.
   */
  private copyOf(shape: CleanElement, clip: CleanElement): string {
    const known = this.copies.get(shape);
    if (known !== undefined) return known;
    const id = this.nextId();
    const attributes = this.bare(shape);
    attributes.set("id", { text: id });
    const own = textOf(shape, "clip-rule");
    if (own !== undefined) attributes.set("fill-rule", kept("fill-rule", own, this.limits));
    this.beside(clip).children.push(element(shape.name, attributes, [], shape.offset));
    this.copies.set(shape, id);
    return id;
  }

  /** A use's `x` or `y` in user units: a percentage of the view box, as browsers take it. */
  private offset(use: CleanElement, name: "x" | "y"): number {
    const text = textOf(use, name);
    if (text === undefined) return 0;
    if (text.endsWith("%")) {
      const fraction = Number(text.slice(0, -1)) / 100;
      return fraction * (name === "x" ? this.viewport.width : this.viewport.height);
    }
    return userUnits(text, this.viewport.base);
  }

  /**
   * A use's `x` and `y` as a translation, for a group to take over: a number of pixels as it was
   * given, so it is read as the same number; in another unit, or a percentage, the number of user
   * units it comes to, refused where six decimals do not hold that exactly.
   */
  private placement(use: CleanElement): string | undefined {
    const [x, y] = [this.exactOffset(use, "x"), this.exactOffset(use, "y")];
    return x === "0" && y === "0" ? undefined : `translate(${x} ${y})`;
  }

  private exactOffset(use: CleanElement, name: "x" | "y"): string {
    const text = textOf(use, name) ?? "0";
    if (Number(text) === 0) return "0";
    if (/^-?[\d.]+$/.test(text)) return (writtenOf(use, name) ?? text).replace(/px$/i, "");
    const refused = (): SvgLogoRejection =>
      new SvgLogoRejection(
        "unsupported-feature",
        `has a use with a clip path and a mask whose ${name} cannot be written to six decimals; give it a position in plain numbers`,
        use.offset,
      );
    if (text.endsWith("%")) {
      // Worked in whole millionths, so the answer is exact or refused, never rounded.
      const side = name === "x" ? this.viewport.width : this.viewport.height;
      const given = millionths(text.slice(0, -1));
      const product = (given ?? 0n) * (millionths(side.toFixed(6)) ?? 0n);
      const divisor = 100n * 1_000_000n;
      if (given === undefined || product % divisor !== 0n) throw refused();
      return decimal(product / divisor);
    }
    const value = userUnits(text, this.viewport.base);
    const written = Number(value.toFixed(6));
    if (Math.abs(written - value) > 1e-9) throw refused();
    return decimal(millionths(written.toFixed(6)) ?? 0n);
  }

  /** What a shape of a rewritten clip path is drawn as in its mask, and the box it can cover. */
  private drawn(
    { child, shape, use, clipRule }: ClipShape,
    clip: CleanElement,
    clipMatrix: Matrix,
  ): { readonly drawn: CleanElement; readonly box: SvgBox } {
    const own = textOf(shape, "transform");
    const ownMatrix = own === undefined ? IDENTITY : parseTransform(own);
    if (use === undefined) {
      const attributes = this.bare(child);
      if (clipRule !== "nonzero")
        attributes.set("fill-rule", kept("fill-rule", clipRule, this.limits));
      return {
        drawn: element(child.name, attributes, [], child.offset),
        box: mapBox(multiply(clipMatrix, ownMatrix), this.box(child)),
      };
    }
    // The use itself is kept, pointing at the bare copy: its position, transform and the clip path
    // on it work in the mask as they did in the clip path.
    const attributes = new Map<string, SvgValue>([
      ["href", { reference: this.copyOf(shape, clip), form: "fragment" }],
    ]);
    for (const name of ["x", "y", "transform", "clip-path"]) {
      const value = use.attributes.get(name);
      if (value !== undefined) attributes.set(name, value);
    }
    if (textOf(shape, "clip-rule") === undefined && clipRule !== "nonzero") {
      attributes.set("fill-rule", kept("fill-rule", clipRule, this.limits));
    }
    const placed = [textOf(use, "transform"), this.placement(use)].filter(
      (part): part is string => part !== undefined,
    );
    const useMatrix = placed.reduce<Matrix>(
      (matrix, part) => multiply(matrix, parseTransform(part)),
      IDENTITY,
    );
    return {
      drawn: element("use", attributes, [], use.offset),
      box: mapBox(multiply(multiply(clipMatrix, useMatrix), ownMatrix), this.box(shape)),
    };
  }

  /** The clip path, replaced where it stands by an alpha mask of the same shapes under the same id. */
  private rewrite(clip: CleanElement, shapes: readonly ClipShape[]): void {
    const objectBox = textOf(clip, "clipPathUnits") === "objectBoundingBox";
    const transform = clip.attributes.get("transform");
    const clipClip = clip.attributes.get("clip-path");
    if (objectBox && (transform !== undefined || clipClip !== undefined)) {
      // Chromium applies these in user space, outside the box the content is drawn in: no mask
      // shared by everything that uses the clip path can stand in for them.
      throw new SvgLogoRejection(
        "unsupported-feature",
        "has a clip path in object bounding box units with a transform or clip path of its own that would have to be written as a mask, which cannot match it; use userSpaceOnUse units, or drop its transform or clip path",
        clip.offset,
      );
    }
    const clipMatrix =
      transform !== undefined && "text" in transform ? parseTransform(transform.text) : IDENTITY;
    for (const { child } of shapes) this.keepIfReferenced(child, clip);
    const copies = shapes.map((shape) => this.drawn(shape, clip, clipMatrix));
    let content = copies.map(({ drawn }) => drawn);
    if (transform !== undefined) {
      content = [element("g", new Map([["transform", transform]]), content, clip.offset)];
    }
    // A clip path's own clip path applies outside its transform.
    if (clipClip !== undefined) {
      content = [element("g", new Map([["clip-path", clipClip]]), content, clip.offset)];
    }
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
    for (const [name, value] of MASK_PAINT) attributes.set(name, kept(name, value, this.limits));
    // A clip path not displayed clips nothing, and a mask not displayed masks nothing.
    const display = clip.attributes.get("display");
    if (display !== undefined) attributes.set("display", display);
    const descriptive = clip.children.filter(isDescriptive);
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
   * antialiased edge is never cut, rounded outwards to the six decimals a number keeps, and held
   * within the largest number a value may be.
   */
  private region(box: SvgBox, attributes: Map<string, SvgValue>): void {
    const empty = box.minX > box.maxX;
    const shapes = empty ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : box;
    const margin = Math.max(shapes.maxX - shapes.minX, shapes.maxY - shapes.minY) / 10;
    const around = grow(shapes, margin);
    // Settled to a thousandth of the last decimal first, so 1.2000000000000002 stays 1.2.
    const settled = (value: number): number => Math.round(value * SCALE * 1000) / 1000;
    // Held to the largest number a value may be: the margin gives way first, and only shapes past
    // it lose their edges, which shows less, never more.
    const largest = 10 ** this.limits.integerDigits - 10 ** -this.limits.fractionDigits;
    const held = (value: number): number => Math.min(largest, Math.max(-largest, value));
    const x = held(Math.floor(settled(around.minX)) / SCALE);
    const y = held(Math.floor(settled(around.minY)) / SCALE);
    const width = held(Math.ceil(settled(around.maxX - x)) / SCALE);
    const height = held(Math.ceil(settled(around.maxY - y)) / SCALE);
    for (const [name, value] of [
      ["x", x],
      ["y", y],
      ["width", width],
      ["height", height],
    ] as const) {
      attributes.set(name, kept(name, decimal(BigInt(Math.round(value * SCALE))), this.limits));
    }
  }

  /**
   * Points everything that used a rewritten clip path at its mask instead. An element with a mask
   * of its own moves into a group that carries its id, its transform and (for a `use`) its
   * position, so a `use` of it, where it stands and the space both masks work in are unchanged,
   * and applies the new mask around its own.
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
          "unsupported-feature",
          "has a clip path that must be written as a mask on a root with a mask of its own; move the clip path or the mask onto a group inside the root",
          node.offset,
        );
      }
      const wrapper = this.wrap(node, clip);
      parent.children = parent.children.map((child) => (child === node ? wrapper : child));
    }
  }

  /** The group (or two) an element with a mask of its own moves into, under the new mask. */
  private wrap(node: CleanElement, mask: SvgValue): CleanElement {
    const id = node.attributes.get("id");
    const transform = writtenOf(node, "transform");
    const placement = node.name === "use" ? this.placement(node) : undefined;
    for (const name of ["id", "transform", "x", "y"]) {
      if (name === "id" || name === "transform" || node.name === "use") {
        node.attributes.delete(name);
      }
    }
    const parts = [transform, placement].filter((part): part is string => part !== undefined);
    const fits = SVG_GRAMMARS.transform?.(parts.join(" "), this.limits) !== undefined;
    const outer = new Map<string, SvgValue>();
    if (id !== undefined) outer.set("id", id);
    if (parts.length === 0 || fits) {
      if (parts.length > 0) outer.set("transform", kept("transform", parts.join(" "), this.limits));
      outer.set("mask", mask);
      return element("g", outer, [node], node.offset);
    }
    if (transform !== undefined) outer.set("transform", kept("transform", transform, this.limits));
    const inner = new Map<string, SvgValue>();
    if (placement !== undefined) {
      inner.set("transform", kept("transform", placement, this.limits));
    }
    inner.set("mask", mask);
    return element("g", outer, [element("g", inner, [node], node.offset)], node.offset);
  }
}

/**
 * Leaves no clip path that makes a renderer combine shapes, which can take minutes however few
 * they are: a clip path of more than one shape, or of one clipped in turn, or clipped itself,
 * becomes an alpha mask of the same shapes, opaque, under the same id, and what used it uses the
 * mask (see the README). A clip path of one shape stays as it is. What a clip path ignores is
 * dropped from it, but kept as a definition where something else draws it.
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
