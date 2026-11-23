import { getVariations } from "./read-variations.ts";
import { AXES, REGISTRY } from "./registry.ts";
import type { VariationsRoot } from "./root.ts";
import type { VariationAxis, VariationState } from "./variation-state.ts";

export type RandomSource = () => number;

// The source is injectable, so a misbehaving one (NaN, out of range) must still give a valid index.
function indexFrom(random: RandomSource, length: number): number {
  const index = Math.floor(random() * length);
  return Number.isNaN(index) ? 0 : Math.min(length - 1, Math.max(0, index));
}

function pickId<Axis extends VariationAxis>(
  axis: Axis,
  random: RandomSource,
  excluding?: VariationState[Axis],
): VariationState[Axis] {
  const ids = REGISTRY[axis].variations
    .map((variation) => variation.id)
    .filter((id) => id !== excluding);
  const id = ids[indexFrom(random, ids.length)];
  if (id === undefined) throw new Error(`The ${axis} axis has no variation to pick`);
  return id as VariationState[Axis];
}

/**
 * Returns a random state for the four axes that differs from the root's current one. It does not
 * apply it, and it leaves the colour scheme alone: that is a preference, not a variation.
 */
export function shuffleVariations(
  random: RandomSource = Math.random,
  options: { readonly root?: VariationsRoot } = {},
): VariationState {
  const current = getVariations(options.root);
  const next: VariationState = {
    theme: pickId("theme", random),
    design: pickId("design", random),
    layout: pickId("layout", random),
    ux: pickId("ux", random),
    scheme: current.scheme,
  };
  if (AXES.some((axis) => next[axis] !== current[axis])) return next;
  // Every pick landed on the current state: move one axis, chosen by the same source.
  const axis = AXES[indexFrom(random, AXES.length)];
  if (axis === undefined) throw new Error("There are no variation axes");
  return { ...next, [axis]: pickId(axis, random, current[axis]) };
}
