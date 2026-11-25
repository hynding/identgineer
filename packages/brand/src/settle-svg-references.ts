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
import { rewriteClipPaths, type Viewport } from "./rewrite-clip-paths.ts";
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

/** Drops what refers to nothing it may use. */
function dropDangling(
  elements: readonly CleanElement[],
  ids: ReadonlyMap<string, CleanElement>,
  removals: Removals,
): void {
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

/**
 * Drops every definition nothing drawn refers to, directly or through other definitions: such a
 * clip path, mask, gradient or `defs` child changes nothing drawn, so leaving it out is exact, and
 * whatever it held can cost no work or output later on. A definition is kept with everything that
 * holds what is drawn; a `defs` element stays where it is unless nothing is left in it.
 */
export function pruneDefinitions(root: CleanElement, limits: SvgLogoLimits): void {
  const ids = collectIds(walk(root), limits);
  const parents = new Map<CleanElement, CleanElement>();
  const kept = new Set<CleanElement>();
  const keep = (element: CleanElement): void => {
    for (let at: CleanElement | undefined = element; at !== undefined && !kept.has(at);) {
      kept.add(at);
      at = parents.get(at);
    }
  };
  for (const element of walk(root)) {
    for (const child of element.children) parents.set(child, element);
  }
  const reached = new Set<CleanElement>();
  const stack = [root];
  for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
    if (reached.has(element)) continue;
    reached.add(element);
    keep(element);
    for (const child of element.children) {
      if (child.name === "defs") keep(child);
      else if (!NOT_DRAWN_IN_PLACE.has(child.name)) stack.push(child);
    }
    for (const { element: target } of targetsOf(element, ids)) stack.push(target);
  }
  // From the leaves up, so a `defs` emptied by the pruning goes too.
  for (const element of walk(root).reverse()) {
    const drops = (child: CleanElement): boolean =>
      !kept.has(child) || (child.name === "defs" && child.children.length === 0);
    if (element.children.some(drops)) {
      element.children = element.children.filter((child) => !drops(child));
    }
  }
}

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
 * any dash array, which together bound the dashes of every shape that inherits a dash array.
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

function ownDasharray(element: CleanElement): string | undefined {
  const value = element.attributes.get("stroke-dasharray");
  return value !== undefined && "text" in value ? value.text : undefined;
}

/**
 * How each shape may be dashed: by its own dash array when it has one (a presentation attribute,
 * which is also where a kept style puts it, beats what it inherits), else, where a dash array can
 * be inherited, at the densest dashing in the logo, else solid. A dash array is inherited from an
 * ancestor and, by each instance a use draws, from that use; one definition is counted once
 * however it is drawn, so it is taken as dashed wherever any of its instances may be.
 */
function dashingByElement(
  elements: readonly CleanElement[],
  ids: ReadonlyMap<string, CleanElement>,
): (element: CleanElement) => Dashing {
  const densest = densestDashing(elements);
  const solid: Dashing = { period: 0, perPeriod: 0 };
  const inheriting = new Set<CleanElement>();
  const stack = elements.filter((element) => {
    const own = ownDasharray(element);
    return own !== undefined && dashingOf(own).period > 0;
  });
  for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
    const reference = element.name === "use" ? referenceOf(element, "href") : undefined;
    const target = reference === undefined ? undefined : ids.get(reference);
    for (const next of target === undefined ? element.children : [...element.children, target]) {
      if (ownDasharray(next) !== undefined || inheriting.has(next)) continue;
      inheriting.add(next);
      stack.push(next);
    }
  }
  return (element) => {
    const own = ownDasharray(element);
    if (own !== undefined) return dashingOf(own);
    return inheriting.has(element) ? densest : solid;
  };
}

/** The root's view box, the viewport percentages are taken of (1 by 1 without one). */
function viewportOf(root: CleanElement): Viewport {
  const viewBox = root.attributes.get("viewBox");
  const [, , width = 1, height = 1] =
    viewBox !== undefined && "text" in viewBox ? viewBox.text.split(" ").map(Number) : [];
  return { width, height, base: Math.max(width, height, 1) };
}

/** The larger side of the root's view box (at least 1), which bounds a percentage from above. */
function percentBase(root: CleanElement): number {
  return viewportOf(root).base;
}

/**
 * What drawing one element costs on its own: a shape its geometry and its dashes (see
 * `dashingByElement`), dearer off one horizontal or vertical line or a rectangle; anything else a
 * little; group opacity a layer.
 */
function ownCost(element: CleanElement, dashing: Dashing, base: number): number {
  const weights = SVG_DRAWING_WEIGHTS;
  const geometry = measureShape(element, base);
  let cost =
    geometry === undefined
      ? weights.element
      : weights.shape +
        geometry.weight +
        dashCount(geometry, dashing) * (geometry.straightRun ? weights.dash : weights.tiledDash);
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
  const dashingFor = dashingByElement(elements, ids);
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
    let cost = ownCost(element, dashingFor(element), base);
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

/**
 * Drops every reference to an id that does not exist or to the wrong kind of element (a `use` with
 * it), reporting each; refuses duplicate ids and a `use` that refers back to itself. Run before the
 * sanitiser adds anything with an id of its own, so nothing dangling can come to refer to it.
 */
export function dropDanglingReferences(
  root: CleanElement,
  limits: SvgLogoLimits,
  removals: Removals,
): void {
  const all = walk(root);
  dropDangling(all, collectIds(all, limits), removals);
}

/**
 * Settles every same-document reference, once dangling ones are dropped: drops definitions nothing
 * drawn refers to, writes clip paths that would make a renderer combine shapes as masks, and
 * refuses cycles and expansions beyond the limits. Returns the drawing cost, and the new name of
 * each id still referenced, numbered in document order after `idPrefix`; every other id is dropped,
 * so the output names nothing a page could collide with by accident.
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
  pruneDefinitions(root, limits);
  rewriteClipPaths(root, collectIds(walk(root), limits), viewportOf(root), limits, removals);
  pruneDefinitions(root, limits);
  const elements = walk(root);
  const ids = collectIds(elements, limits);
  const drawingCost = checkExpansion(root, elements, ids, limits);
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
