import type { CleanElement } from "./filter-svg-tree.ts";
import { GRADIENTS, USABLE } from "./svg-allowlist.ts";
import {
  dashCount,
  dashingOf,
  measureShape,
  SVG_DRAWING_WEIGHTS,
  type Dashing,
} from "./svg-drawing-cost.ts";
import { measureOverdraw } from "./svg-overdraw.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";
import type { Removals } from "./svg-removals.ts";

/** What each referencing attribute may point at, by element name. */
function allowedTargets(element: CleanElement, attribute: string): ReadonlySet<string> {
  if (attribute === "fill" || attribute === "stroke") return GRADIENTS;
  if (attribute === "clip-path") return new Set(["clipPath"]);
  if (attribute === "mask") return new Set(["mask"]);
  return element.name === "use" ? USABLE : GRADIENTS;
}

function referenceOf(element: CleanElement, attribute: string): string | undefined {
  const value = element.attributes.get(attribute);
  return value !== undefined && "reference" in value ? value.reference : undefined;
}

/** Every element in document order, gathered without recursion. */
function walk(root: CleanElement): CleanElement[] {
  const order: CleanElement[] = [];
  const stack = [root];
  for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
    order.push(element);
    for (let index = element.children.length - 1; index >= 0; index -= 1) {
      const child = element.children[index];
      if (child !== undefined) stack.push(child);
    }
  }
  return order;
}

function collectIds(
  elements: readonly CleanElement[],
  limits: SvgLogoLimits,
): Map<string, CleanElement> {
  const ids = new Map<string, CleanElement>();
  for (const element of elements) {
    const id = element.attributes.get("id");
    if (id === undefined || !("text" in id)) continue;
    if (ids.has(id.text)) {
      throw new SvgLogoRejection("duplicate-id", "uses one id on two elements", element.offset);
    }
    ids.set(id.text, element);
    if (ids.size > limits.ids) {
      throw new SvgLogoRejection(
        "too-many-ids",
        `has more than ${String(limits.ids)} ids`,
        element.offset,
      );
    }
  }
  return ids;
}

/**
 * Whether a `use` draws something: its target exists, may be drawn, and (when it is another `use`)
 * draws something in turn. Followed iteratively, so a long chain cannot exhaust the stack; a chain
 * that comes back on itself refuses the document.
 */
function unusableUses(
  elements: readonly CleanElement[],
  ids: ReadonlyMap<string, CleanElement>,
): Set<CleanElement> {
  const known = new Map<CleanElement, boolean>();
  for (const element of elements) {
    if (element.name !== "use" || known.has(element)) continue;
    const chain: CleanElement[] = [];
    const onChain = new Set<CleanElement>();
    let current: CleanElement = element;
    let result: boolean;
    for (;;) {
      chain.push(current);
      onChain.add(current);
      const reference = referenceOf(current, "href");
      const target = reference === undefined ? undefined : ids.get(reference);
      if (target === undefined || !USABLE.has(target.name)) {
        result = false;
        break;
      }
      if (target.name !== "use") {
        result = true;
        break;
      }
      if (onChain.has(target)) {
        throw new SvgLogoRejection(
          "reference-cycle",
          "has a use that refers back to itself",
          target.offset,
        );
      }
      const settled = known.get(target);
      if (settled !== undefined) {
        result = settled;
        break;
      }
      current = target;
    }
    for (const link of chain) known.set(link, result);
  }
  return new Set([...known].filter(([, usable]) => !usable).map(([use]) => use));
}

/** Drops what refers to nothing it may use, and returns the `use` elements removed. */
function dropDangling(
  elements: readonly CleanElement[],
  ids: ReadonlyMap<string, CleanElement>,
  removals: Removals,
): Set<CleanElement> {
  const unusable = unusableUses(elements, ids);
  for (const element of elements) {
    if (unusable.has(element)) {
      removals.add({ element: element.qualified }, "dangling-reference", element.offset);
      continue;
    }
    if (element.children.some((child) => unusable.has(child))) {
      element.children = element.children.filter((child) => !unusable.has(child));
    }
    for (const attribute of ["fill", "stroke", "clip-path", "mask", "href"]) {
      if (element.name === "use" && attribute === "href") continue;
      const reference = referenceOf(element, attribute);
      if (reference === undefined) continue;
      const target = ids.get(reference);
      if (target !== undefined && allowedTargets(element, attribute).has(target.name)) continue;
      removals.add({ element: element.qualified, attribute }, "dangling-reference", element.offset);
      // A paint server that cannot be found paints nothing; dropping the attribute would paint black.
      if (attribute === "fill" || attribute === "stroke")
        element.attributes.set(attribute, { text: "none" });
      else element.attributes.delete(attribute);
    }
  }
  return unusable;
}

interface Target {
  readonly element: CleanElement;
  readonly attribute: string;
}

function targetsOf(element: CleanElement, ids: ReadonlyMap<string, CleanElement>): Target[] {
  const targets: Target[] = [];
  for (const attribute of ["href", "fill", "stroke", "clip-path", "mask"]) {
    const reference = referenceOf(element, attribute);
    const target = reference === undefined ? undefined : ids.get(reference);
    if (target !== undefined) targets.push({ element: target, attribute });
  }
  return targets;
}

/** Definitions: kept for what refers to them, never drawn where they stand. */
const NOT_DRAWN_IN_PLACE: ReadonlySet<string> = new Set([
  "defs",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
]);

interface Expansion {
  /** Elements once every reference is expanded, definitions included. */
  readonly size: number;
  /** The most references followed in a row from this element down. */
  readonly height: number;
  /** What drawing it costs (see `SVG_DRAWING_WEIGHTS`), each reference expanded. */
  readonly cost: number;
  /** Masks and clip paths applied in drawing it. */
  readonly masks: number;
  /** The most masks and clip paths applied inside one another in drawing it. */
  readonly maskDepth: number;
}

/**
 * The shortest dash period anywhere in the logo, 0 for none, and the most dashes in one repeat of
 * any dash array, which together bound the dashes of every shape: dash arrays inherit, through use
 * too.
 */
function densestDashing(elements: readonly CleanElement[]): Dashing {
  let period = 0;
  let perPeriod = 0;
  for (const element of elements) {
    const value = element.attributes.get("stroke-dasharray");
    if (value === undefined || !("text" in value)) continue;
    const dashing = dashingOf(value.text);
    if (dashing.period === 0) continue;
    if (period === 0 || dashing.period < period) period = dashing.period;
    perPeriod = Math.max(perPeriod, dashing.perPeriod);
  }
  return { period, perPeriod };
}

/** The larger side of the root's view box (at least 1), which bounds a percentage from above. */
function percentBase(root: CleanElement): number {
  const viewBox = root.attributes.get("viewBox");
  const [, , width = 1, height = 1] =
    viewBox !== undefined && "text" in viewBox ? viewBox.text.split(" ").map(Number) : [];
  return Math.max(width, height, 1);
}

/**
 * What drawing one element costs on its own: a shape its geometry and, wherever a dash array might
 * reach it, its dashes at the densest dashing in the logo; anything else a little; group opacity a
 * layer.
 */
function ownCost(element: CleanElement, dashing: Dashing, base: number): number {
  const weights = SVG_DRAWING_WEIGHTS;
  const geometry = measureShape(element, base);
  let cost =
    geometry === undefined
      ? weights.element
      : weights.shape + geometry.weight + dashCount(geometry, dashing) * weights.dash;
  const opacity = element.attributes.get("opacity");
  if (opacity !== undefined && "text" in opacity && Number(opacity.text) < 1) cost += weights.layer;
  return cost;
}

/**
 * Expands every reference, refusing a reference cycle, a chain of references deeper than the limit
 * and a logo over any limit on what drawing it takes: elements drawn (an element referenced ten
 * times is drawn ten times), drawing cost, masks applied and masks nested. Each element is measured
 * once, so the work is linear however large the totals. Returns the drawing cost.
 */
function checkExpansion(
  root: CleanElement,
  elements: readonly CleanElement[],
  ids: ReadonlyMap<string, CleanElement>,
  limits: SvgLogoLimits,
): number {
  const done = new Map<CleanElement, Expansion>();
  const visiting = new Set<CleanElement>();
  const dashing = densestDashing(elements);
  const base = percentBase(root);
  // Totals stop just over their limit, so no sum grows without bound; each limit below is checked
  // so that a total that is not a number is refused too.
  const capped = (value: number, limit: number): number => Math.min(value, limit + 1);
  const tooDeep = (element: CleanElement): SvgLogoRejection =>
    new SvgLogoRejection(
      "reference-too-deep",
      `follows more than ${String(limits.referenceDepth)} references in a row`,
      element.offset,
    );
  const visit = (element: CleanElement, depth: number): Expansion => {
    if (depth > limits.referenceDepth) throw tooDeep(element);
    const finished = done.get(element);
    if (finished !== undefined) {
      if (depth + finished.height > limits.referenceDepth) throw tooDeep(element);
      return finished;
    }
    if (visiting.has(element)) {
      throw new SvgLogoRejection(
        "reference-cycle",
        "has references that form a cycle",
        element.offset,
      );
    }
    visiting.add(element);
    let size = 1;
    let height = 0;
    let cost = ownCost(element, dashing, base);
    let masks = 0;
    let maskDepth = 0;
    const draw = (measured: Expansion, extraCost: number, extraMasks: number): void => {
      cost = capped(cost + extraCost + measured.cost, limits.drawingCost);
      masks = capped(masks + extraMasks + measured.masks, limits.maskApplications);
      maskDepth = Math.max(maskDepth, extraMasks + measured.maskDepth);
    };
    for (const child of element.children) {
      const measured = visit(child, depth);
      size = capped(size + measured.size, limits.renderedElements);
      height = Math.max(height, measured.height);
      if (!NOT_DRAWN_IN_PLACE.has(child.name)) draw(measured, 0, 0);
    }
    for (const { element: target, attribute } of targetsOf(element, ids)) {
      const measured = visit(target, depth + 1);
      height = Math.max(height, measured.height + 1);
      // A paint server is not drawn again for each shape it paints; a gradient's href only
      // borrows its stops.
      if (attribute === "fill" || attribute === "stroke" || GRADIENTS.has(element.name)) continue;
      size = capped(size + measured.size, limits.renderedElements);
      if (attribute === "href") draw(measured, 0, 0);
      else draw(measured, SVG_DRAWING_WEIGHTS.mask, 1);
    }
    visiting.delete(element);
    const expansion = { size, height, cost, masks, maskDepth };
    done.set(element, expansion);
    return expansion;
  };
  const total = visit(root, 0);
  if (!(total.size <= limits.renderedElements)) {
    throw new SvgLogoRejection(
      "expansion-too-large",
      `draws more than ${String(limits.renderedElements)} elements once references are expanded`,
    );
  }
  if (!(total.maskDepth <= limits.maskDepth)) {
    throw new SvgLogoRejection(
      "masks-too-deep",
      `applies more than ${String(limits.maskDepth)} masks or clip paths inside one another`,
    );
  }
  if (!(total.masks <= limits.maskApplications)) {
    throw new SvgLogoRejection(
      "too-many-masks",
      `applies masks or clip paths more than ${String(limits.maskApplications)} times`,
    );
  }
  if (!(total.cost <= limits.drawingCost)) {
    throw new SvgLogoRejection(
      "drawing-too-costly",
      `would cost more than ${String(limits.drawingCost)} to draw (see SVG_DRAWING_WEIGHTS)`,
    );
  }
  return total.cost;
}

/** What a clip path draws, once every use is expanded: how many shapes, and their degrees added up. */
interface ClipShapes {
  readonly count: number;
  readonly degree: number;
}

/**
 * Refuses clip paths whose shapes could cross more than `limits.clipCrossings` times in all. A clip
 * path of more than one shape is combined into one outline, and its edges, each shape's own among
 * them, could cross up to half the square of their degrees added up (see `Geometry.degree`); one
 * shape alone clips by its outline and crosses nothing. Run after the expansion limits, so no use
 * comes back on itself.
 */
function checkClipCrossings(
  elements: readonly CleanElement[],
  ids: ReadonlyMap<string, CleanElement>,
  base: number,
  limits: SvgLogoLimits,
): void {
  const known = new Map<CleanElement, ClipShapes>();
  const add = (left: ClipShapes, right: ClipShapes): ClipShapes => ({
    count: left.count + right.count,
    degree: left.degree + right.degree,
  });
  const none: ClipShapes = { count: 0, degree: 0 };
  const shapes = (element: CleanElement): ClipShapes => {
    const found = known.get(element);
    if (found !== undefined) return found;
    let drawn = none;
    if (element.name === "use") {
      const reference = referenceOf(element, "href");
      const target = reference === undefined ? undefined : ids.get(reference);
      if (target !== undefined) drawn = shapes(target);
    } else if (element.name === "g") {
      drawn = element.children.reduce((total, child) => add(total, shapes(child)), none);
    } else {
      const geometry = measureShape(element, base);
      if (geometry !== undefined) drawn = { count: 1, degree: geometry.degree };
    }
    known.set(element, drawn);
    return drawn;
  };
  let crossings = 0;
  for (const clip of elements) {
    if (clip.name !== "clipPath") continue;
    const drawn = clip.children.reduce((total, child) => add(total, shapes(child)), none);
    if (drawn.count > 1) crossings += (drawn.degree * drawn.degree) / 2;
  }
  if (!(crossings <= limits.clipCrossings)) {
    throw new SvgLogoRejection(
      "drawing-too-costly",
      `has clip paths whose shapes could cross more than ${String(limits.clipCrossings)} times`,
    );
  }
}

/**
 * Settles every same-document reference: a reference to an id that does not exist, or to the
 * wrong kind of element, is dropped (a `use` with it); duplicate ids, cycles and expansions beyond
 * the limits refuse the document. Returns the drawing cost, and the new name of each id still
 * referenced, numbered in document order after `idPrefix`; every other id is dropped, so the output
 * names nothing a page could collide with by accident.
 */
export function settleSvgReferences(
  root: CleanElement,
  limits: SvgLogoLimits,
  idPrefix: string,
  removals: Removals,
): {
  readonly renamed: Map<string, string>;
  readonly drawingCost: number;
  readonly overdraw: number;
} {
  const all = walk(root);
  const dropped = dropDangling(all, collectIds(all, limits), removals);
  const elements = dropped.size === 0 ? all : all.filter((element) => !dropped.has(element));
  const ids = collectIds(elements, limits);
  const drawingCost = checkExpansion(root, elements, ids, limits);
  checkClipCrossings(elements, ids, percentBase(root), limits);
  const overdraw = measureOverdraw(root, ids, limits);
  const referenced = new Set<string>();
  for (const element of elements) {
    for (const attribute of ["href", "fill", "stroke", "clip-path", "mask"]) {
      const reference = referenceOf(element, attribute);
      if (reference !== undefined) referenced.add(reference);
    }
  }
  const renamed = new Map<string, string>();
  for (const element of elements) {
    const id = element.attributes.get("id");
    if (id !== undefined && "text" in id && referenced.has(id.text)) {
      renamed.set(id.text, `${idPrefix}${String(renamed.size)}`);
    }
  }
  return { renamed, drawingCost, overdraw };
}
