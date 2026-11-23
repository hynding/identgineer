import type { CleanElement } from "./filter-svg-tree.ts";
import { GRADIENTS, USABLE } from "./svg-allowlist.ts";
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
  /** A gradient is not drawn again for each shape it paints, so paint adds nothing to the count. */
  readonly drawn: boolean;
}

function targetsOf(element: CleanElement, ids: ReadonlyMap<string, CleanElement>): Target[] {
  const targets: Target[] = [];
  for (const attribute of ["href", "fill", "stroke", "clip-path", "mask"]) {
    const reference = referenceOf(element, attribute);
    const target = reference === undefined ? undefined : ids.get(reference);
    const drawn = attribute !== "fill" && attribute !== "stroke" && !GRADIENTS.has(element.name);
    if (target !== undefined) targets.push({ element: target, drawn });
  }
  return targets;
}

interface Expansion {
  readonly size: number;
  /** The most references followed in a row from this element down. */
  readonly height: number;
}

/**
 * Counts the elements drawn once every reference is expanded (an element referenced ten times is
 * drawn ten times), refusing a reference cycle, a chain of references deeper than the limit and a
 * total beyond it. Each element is measured once, so the work is linear however large the total.
 */
function checkExpansion(
  root: CleanElement,
  ids: ReadonlyMap<string, CleanElement>,
  limits: SvgLogoLimits,
): void {
  const done = new Map<CleanElement, Expansion>();
  const visiting = new Set<CleanElement>();
  const cap = limits.renderedElements + 1;
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
    for (const child of element.children) {
      const measured = visit(child, depth);
      size = Math.min(cap, size + measured.size);
      height = Math.max(height, measured.height);
    }
    for (const target of targetsOf(element, ids)) {
      const measured = visit(target.element, depth + 1);
      if (target.drawn) size = Math.min(cap, size + measured.size);
      height = Math.max(height, measured.height + 1);
    }
    visiting.delete(element);
    const expansion = { size, height };
    done.set(element, expansion);
    return expansion;
  };
  if (visit(root, 0).size > limits.renderedElements) {
    throw new SvgLogoRejection(
      "expansion-too-large",
      `draws more than ${String(limits.renderedElements)} elements once references are expanded`,
    );
  }
}

/**
 * Settles every same-document reference: a reference to an id that does not exist, or to the
 * wrong kind of element, is dropped (a `use` with it); duplicate ids, cycles and expansions beyond
 * the limits refuse the document. Returns the new name of each id still referenced, numbered in
 * document order after `idPrefix`; every other id is dropped, so the output names nothing a page
 * could collide with by accident.
 */
export function settleSvgReferences(
  root: CleanElement,
  limits: SvgLogoLimits,
  idPrefix: string,
  removals: Removals,
): Map<string, string> {
  const all = walk(root);
  const dropped = dropDangling(all, collectIds(all, limits), removals);
  const elements = dropped.size === 0 ? all : all.filter((element) => !dropped.has(element));
  const ids = collectIds(elements, limits);
  checkExpansion(root, ids, limits);
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
  return renamed;
}
