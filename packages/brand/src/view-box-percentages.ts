import type { CleanElement } from "./filter-svg-tree.ts";
import { GRADIENTS } from "./svg-allowlist.ts";

/** A mask's region, which it takes of a box unless it is in user space. */
const REGION: ReadonlySet<string> = new Set(["x", "y", "width", "height"]);

function textOf(element: CleanElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return value !== undefined && "text" in value ? value.text : undefined;
}

/**
 * A gradient's units, as it takes them: its own, or else those of the gradient it takes its stops
 * from, and so on (`objectBoundingBox` when none says).
 */
function gradientUnits(gradient: CleanElement, ids: ReadonlyMap<string, CleanElement>): string {
  const seen = new Set<CleanElement>();
  let at: CleanElement | undefined = gradient;
  while (at !== undefined && GRADIENTS.has(at.name) && !seen.has(at)) {
    seen.add(at);
    const units = textOf(at, "gradientUnits");
    if (units !== undefined) return units;
    const href = at.attributes.get("href");
    at = href !== undefined && "reference" in href ? ids.get(href.reference) : undefined;
  }
  return "objectBoundingBox";
}

/** Whether a length attribute of `element` is taken of a box rather than of the view box. */
function ofABox(
  element: CleanElement,
  name: string,
  ids: ReadonlyMap<string, CleanElement>,
): boolean {
  if (GRADIENTS.has(element.name)) return gradientUnits(element, ids) === "objectBoundingBox";
  if (element.name === "mask" && REGION.has(name)) {
    return textOf(element, "maskUnits") !== "userSpaceOnUse";
  }
  // Everything else, a shape in a clip path or mask in object-bounding-box units included, whose
  // percentages Chromium takes of the view box.
  return false;
}

/**
 * The first element with a length given as a percentage of the view box, if any: of a shape, a
 * `use`, a stroke, a mask's region in user space or a gradient in user space. A percentage of a
 * mask's region or a gradient in object-bounding-box units is of the box of what it applies to.
 */
export function findViewBoxPercentage(root: CleanElement): CleanElement | undefined {
  const ids = new Map<string, CleanElement>();
  const all: CleanElement[] = [];
  const stack = [root];
  for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
    all.push(element);
    const id = textOf(element, "id");
    if (id !== undefined) ids.set(id, element);
    stack.push(...element.children);
  }
  return all.find((element) =>
    [...element.attributes].some(
      ([name, value]) => "text" in value && value.text.endsWith("%") && !ofABox(element, name, ids),
    ),
  );
}
