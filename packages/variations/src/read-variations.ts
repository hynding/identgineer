import { REGISTRY, STATE_KEYS } from "./registry.ts";
import { resolveRoot } from "./root.ts";
import type { VariationsRoot } from "./root.ts";
import { isVariationId } from "./validate.ts";
import type { StateKey, VariationState } from "./variation-state.ts";

export function defaultVariations(): VariationState {
  return {
    theme: REGISTRY.theme.defaultId,
    design: REGISTRY.design.defaultId,
    layout: REGISTRY.layout.defaultId,
    ux: REGISTRY.ux.defaultId,
    scheme: REGISTRY.scheme.defaultId,
  };
}

function readKey<Key extends StateKey>(root: Element, key: Key): VariationState[Key] {
  const value = root.getAttribute(REGISTRY[key].attribute);
  return isVariationId(key, value) ? value : (REGISTRY[key].defaultId as VariationState[Key]);
}

/** Whatever the attributes hold is untrusted: anything outside the registry reads as the default. */
export function getVariations(root?: VariationsRoot): VariationState {
  const target = resolveRoot(root);
  if (!target) return defaultVariations();
  return {
    theme: readKey(target, "theme"),
    design: readKey(target, "design"),
    layout: readKey(target, "layout"),
    ux: readKey(target, "ux"),
    scheme: readKey(target, "scheme"),
  };
}

export function changedKeys(before: VariationState, after: VariationState): StateKey[] {
  return STATE_KEYS.filter((key) => before[key] !== after[key]);
}
