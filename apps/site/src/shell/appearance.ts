import { AXES, REGISTRY, type VariationAxis, type VariationState } from "@identgineer/variations";

const AXIS_NOUNS: Readonly<Record<VariationAxis, string>> = {
  theme: "theme",
  design: "design",
  layout: "layout",
  ux: "UX mode",
};

export function labelOf(axis: VariationAxis, id: string): string {
  const variations: readonly { readonly id: string; readonly label: string }[] =
    REGISTRY[axis].variations;
  return variations.find((variation) => variation.id === id)?.label ?? id;
}

/** One choice of an axis, as a sentence for a polite live region: `Design: Brutalist.` */
export function describeChoice(axis: VariationAxis, id: string): string {
  const noun = AXIS_NOUNS[axis];
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}: ${labelOf(axis, id)}.`;
}

/** What a shuffle landed on, as one sentence for a polite live region. */
export function describeLook(state: VariationState): string {
  const parts = AXES.map((axis) => `the ${labelOf(axis, state[axis])} ${AXIS_NOUNS[axis]}`);
  const last = parts.pop() ?? "";
  return `Now showing ${parts.join(", ")} and ${last}.`;
}

/** How many looks the four axes make together; the scheme is a preference, not a look. */
export function lookCount(): number {
  return AXES.reduce((count, axis) => count * REGISTRY[axis].variations.length, 1);
}
