import { clearStoredVariations, mergeStoredVariations } from "./storage.ts";
import type { StorageLike } from "./storage.ts";
import { changedKeys, defaultVariations, getVariations } from "./read-variations.ts";
import { REGISTRY, STATE_KEYS } from "./registry.ts";
import { resolveRoot } from "./root.ts";
import type { VariationsRoot } from "./root.ts";
import { validateVariations } from "./validate.ts";
import { announceChange } from "./variations-events.ts";
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

function writeKey(root: Element, key: StateKey, value: string): void {
  const attribute = REGISTRY[key].attribute;
  if (key === "scheme" && value === "system") root.removeAttribute(attribute);
  else root.setAttribute(attribute, value);
}

function persistChoice(valid: Partial<VariationState>, storage: StorageLike | undefined): void {
  if (Object.keys(valid).length === 0) return;
  mergeStoredVariations(valid, storage);
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
  const changed = changedKeys(before, state);
  if (target) announceChange(target, state, before);
  return Object.freeze({
    state: Object.freeze(state),
    rejected: Object.freeze(rejected.map((entry) => Object.freeze(entry))),
    changed: Object.freeze(changed),
  });
}

/** Removes every attribute, so the stylesheet defaults apply again. */
export function resetVariations(options: RootOptions = {}): VariationsResult {
  const target = resolveRoot(options.root);
  const before = getVariations(target);
  if (target) for (const key of STATE_KEYS) target.removeAttribute(REGISTRY[key].attribute);
  const state = defaultVariations();
  if (options.persist === true) clearStoredVariations(options.storage);
  const changed = changedKeys(before, state);
  if (target) announceChange(target, state, before);
  return Object.freeze({ state: Object.freeze(state), changed: Object.freeze(changed) });
}
