import type { CleanElement } from "./filter-svg-tree.ts";
import { GRADIENTS } from "./svg-allowlist.ts";

const COORDINATES: Readonly<Record<string, readonly string[]>> = {
  linearGradient: ["x1", "y1", "x2", "y2"],
  radialGradient: ["cx", "cy", "r", "fx", "fy", "fr"],
};
/** Each gradient coordinate's default: a percentage, taken of the view box in user space. */
const DEFAULTS: Readonly<Record<string, string>> = {
  x1: "0%",
  y1: "0%",
  x2: "100%",
  y2: "0%",
  cx: "50%",
  cy: "50%",
  r: "50%",
  fr: "0%",
};
/** A focus left out is the centre, whatever the centre turns out to be. */
const FOCUS_FOLLOWS: Readonly<Record<string, string>> = { fx: "cx", fy: "cy" };
/** A mask's region by default, taken of the view box when the mask is in user space. */
const MASK_REGION: Readonly<Record<string, string>> = {
  x: "-10%",
  y: "-10%",
  width: "120%",
  height: "120%",
};

function textOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "text" in value ? value.text : undefined;
}

function referenceOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "reference" in value ? value.reference : undefined;
}

/** A percentage other than zero: zero of the view box is zero of anything. */
function isPercentage(value: string | undefined): boolean {
  return value !== undefined && value.endsWith("%") && Number(value.slice(0, -1)) !== 0;
}

/** The gradient and those it takes attributes from, nearest first, each once. */
function chainOf(gradient: CleanElement, ids: ReadonlyMap<string, CleanElement>): CleanElement[] {
  const chain: CleanElement[] = [];
  for (
    let at: CleanElement | undefined = gradient;
    at !== undefined && GRADIENTS.has(at.name) && !chain.includes(at);
    at = ids.get(referenceOf(at, "href") ?? "")
  ) {
    chain.push(at);
  }
  return chain;
}

/**
 * A gradient attribute as the gradient takes it: its own, or else the nearest in its chain that
 * has it. Units are shared by both kinds; a coordinate comes only from a gradient of the same kind,
 * past any of the other kind between, as Chromium takes it.
 */
function inherited(chain: readonly CleanElement[], name: string): string | undefined {
  const kind = chain[0]?.name;
  const shared = name === "gradientUnits";
  for (const gradient of chain) {
    const value = shared || gradient.name === kind ? textOf(gradient, name) : undefined;
    if (value !== undefined) return value;
  }
  return undefined;
}

function coordinate(chain: readonly CleanElement[], name: string): string | undefined {
  const value = inherited(chain, name);
  if (value !== undefined) return value;
  const centre = FOCUS_FOLLOWS[name];
  if (centre !== undefined) return coordinate(chain, centre);
  return DEFAULTS[name];
}

/** Whether a painted gradient, resolved through its chain and defaults, takes the view box. */
function gradientTakesTheViewBox(
  gradient: CleanElement,
  ids: ReadonlyMap<string, CleanElement>,
): boolean {
  const chain = chainOf(gradient, ids);
  if (inherited(chain, "gradientUnits") !== "userSpaceOnUse") return false;
  return (COORDINATES[gradient.name] ?? []).some((name) => isPercentage(coordinate(chain, name)));
}

/** Whether a mask's region, written or by default, takes the view box. */
function maskRegionTakesTheViewBox(mask: CleanElement): boolean {
  if (textOf(mask, "maskUnits") !== "userSpaceOnUse") return false;
  return Object.entries(MASK_REGION).some(([name, fallback]) =>
    isPercentage(textOf(mask, name) ?? fallback),
  );
}

/** Attributes whose percentages the rules above settle, for the element they are on. */
function settledElsewhere(element: CleanElement, name: string): boolean {
  if (GRADIENTS.has(element.name)) return COORDINATES[element.name]?.includes(name) === true;
  return element.name === "mask" && name in MASK_REGION;
}

/**
 * The first element with a length taken as a percentage of the view box, if any: of a shape, a
 * `use` or a stroke; a mask's region in user space, written or by default; or a painted gradient's
 * coordinate in user space, written, inherited or by default. A percentage of a box (a mask's
 * region or a gradient in object-bounding-box units) is not one.
 */
export function findViewBoxPercentage(root: CleanElement): CleanElement | undefined {
  const ids = new Map<string, CleanElement>();
  const painted = new Set<string>();
  const all: CleanElement[] = [];
  const stack = [root];
  for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
    all.push(element);
    const id = textOf(element, "id");
    if (id !== undefined) ids.set(id, element);
    for (const name of ["fill", "stroke"]) {
      const reference = referenceOf(element, name);
      if (reference !== undefined) painted.add(reference);
    }
    stack.push(...element.children);
  }
  return all.find((element) => {
    const id = textOf(element, "id");
    if (GRADIENTS.has(element.name) && id !== undefined && painted.has(id)) {
      if (gradientTakesTheViewBox(element, ids)) return true;
    }
    if (element.name === "mask" && maskRegionTakesTheViewBox(element)) return true;
    return [...element.attributes].some(
      ([name, value]) =>
        "text" in value && isPercentage(value.text) && !settledElsewhere(element, name),
    );
  });
}
