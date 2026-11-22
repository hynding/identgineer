import { REGISTRY, type StateKey, type VariationState } from "@identgineer/variations";

/** The controls of the panel, in the order it draws them. */
export const CONTROLS = ["theme", "design", "layout", "ux", "scheme"] as const;

export type ControlName = (typeof CONTROLS)[number];

export const ORIENTATIONS = ["inline", "stacked"] as const;

export type SwitcherOrientation = (typeof ORIENTATIONS)[number];

export const CONTROL_LABELS: Readonly<Record<ControlName, string>> = {
  theme: "Theme",
  design: "Design",
  layout: "Layout",
  ux: "UX",
  scheme: "Scheme",
};

export const SCHEME_OPTIONS: readonly { id: VariationState["scheme"]; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/**
 * Reads the `axes` attribute: a comma separated list of control names. Unknown names are ignored,
 * and so are repeats. Without a known name every control is shown, because a panel with nothing
 * in it helps nobody.
 */
export function parseControls(value: string | undefined): readonly ControlName[] {
  if (typeof value !== "string") return CONTROLS;
  const named = new Set(value.split(",").map((entry) => entry.trim()));
  const known = CONTROLS.filter((control) => named.has(control));
  return known.length === 0 ? CONTROLS : known;
}

const HEX_COLOUR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * The swatches are drawn as `fill` attributes of an svg. The registry is our own data, but only
 * a hex colour is ever allowed to reach an attribute, so nothing else can be smuggled through it.
 */
export function swatchColour(value: string): string | undefined {
  return HEX_COLOUR.test(value) ? value : undefined;
}

export function optionLabel(
  control: ControlName,
  state: Pick<VariationState, ControlName>,
): string {
  const id = state[control];
  if (control === "scheme") {
    return SCHEME_OPTIONS.find((option) => option.id === id)?.label ?? id;
  }
  return REGISTRY[control].variations.find((variation) => variation.id === id)?.label ?? id;
}

/** What a screen reader is told after a change: the control and the option now chosen. */
export function describeChange(
  controls: ControlName | readonly ControlName[],
  state: Pick<VariationState, ControlName>,
): string {
  const named = typeof controls === "string" ? [controls] : controls;
  return named
    .map((control) => `${CONTROL_LABELS[control]}: ${optionLabel(control, state)}.`)
    .join(" ");
}

/** Detail of `idgVariationsChange`. */
export interface VariationsChangeDetail {
  /** The whole state after the change. */
  readonly state: VariationState;
  /** The keys whose value is different now. */
  readonly changed: readonly StateKey[];
}
