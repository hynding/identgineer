import { clearStoredVariations, loadVariations, saveVariations } from "./storage.ts";
import type { StorageLike } from "./storage.ts";
import { REGISTRY, STATE_KEYS } from "./registry.ts";
import { resolveRoot } from "./root.ts";
import type { VariationsRoot } from "./root.ts";
import { isVariationId, validateVariations } from "./validate.ts";
import type { RejectedVariation } from "./validate.ts";
import type { StateKey, VariationState } from "./variation-state.ts";

export interface RootOptions {
  /** Defaults to the global document's root element, when there is one. */
  readonly root?: VariationsRoot;
  /** Defaults to `localStorage`, when there is one. Only used with `persist`. */
  readonly storage?: StorageLike;
  /** Opt in to remembering the choice. Off by default. */
  readonly persist?: boolean;
}

export interface VariationsResult {
  readonly state: VariationState;
  /** The keys whose value is different now. */
  readonly changed: readonly StateKey[];
}

export interface ApplyResult extends VariationsResult {
  readonly rejected: readonly RejectedVariation[];
}

function defaultState(): VariationState {
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
  if (!target) return defaultState();
  return {
    theme: readKey(target, "theme"),
    design: readKey(target, "design"),
    layout: readKey(target, "layout"),
    ux: readKey(target, "ux"),
    scheme: readKey(target, "scheme"),
  };
}

function writeKey(root: Element, key: StateKey, value: string): void {
  const attribute = REGISTRY[key].attribute;
  if (key === "scheme" && value === "system") root.removeAttribute(attribute);
  else root.setAttribute(attribute, value);
}

function changedKeys(before: VariationState, after: VariationState): StateKey[] {
  return STATE_KEYS.filter((key) => before[key] !== after[key]);
}

function persistChoice(valid: Partial<VariationState>, storage: StorageLike | undefined): void {
  if (Object.keys(valid).length === 0) return;
  saveVariations({ ...loadVariations(storage), ...valid }, storage);
}

/**
 * Validates, then sets only the axes present in `partial`. It never throws on bad input: invalid
 * values are left out and listed in `rejected`.
 */
export function applyVariations(
  partial: Partial<VariationState>,
  options: RootOptions = {},
): ApplyResult {
  const { valid, rejected } = validateVariations(partial);
  const target = resolveRoot(options.root);
  const before = getVariations(target);
  if (target) {
    for (const key of STATE_KEYS) {
      const value = valid[key];
      if (value !== undefined) writeKey(target, key, value);
    }
  }
  const state = target ? getVariations(target) : { ...before, ...valid };
  if (options.persist === true) persistChoice(valid, options.storage);
  return { state, rejected, changed: changedKeys(before, state) };
}

/** Removes every attribute, so the stylesheet defaults apply again. */
export function resetVariations(options: RootOptions = {}): VariationsResult {
  const target = resolveRoot(options.root);
  const before = getVariations(target);
  if (target) for (const key of STATE_KEYS) target.removeAttribute(REGISTRY[key].attribute);
  const state = defaultState();
  if (options.persist === true) clearStoredVariations(options.storage);
  return { state, changed: changedKeys(before, state) };
}
