import { REGISTRY, STATE_KEYS } from "./registry.ts";
import type { StateKey, VariationState } from "./variation-state.ts";

export interface RejectedVariation {
  readonly axis: StateKey;
  readonly value: unknown;
}

export interface ValidatedVariations {
  readonly valid: Partial<VariationState>;
  readonly rejected: readonly RejectedVariation[];
}

type Writable<T> = { -readonly [Key in keyof T]: T[Key] };

function idsOf(key: StateKey): ReadonlySet<string> {
  if (key === "scheme") return new Set(REGISTRY.scheme.ids);
  return new Set(REGISTRY[key].variations.map((variation) => variation.id));
}

const ALLOWED: Readonly<Record<StateKey, ReadonlySet<string>>> = Object.freeze({
  theme: idsOf("theme"),
  design: idsOf("design"),
  layout: idsOf("layout"),
  ux: idsOf("ux"),
  scheme: idsOf("scheme"),
});

/**
 * The single gate between untrusted text and the DOM: an exact match against the registry.
 * Nothing is trimmed, case-folded or otherwise coerced, so what passes is always one of the
 * registry's own strings.
 */
export function isVariationId<Key extends StateKey>(
  key: Key,
  value: unknown,
): value is VariationState[Key] {
  return typeof value === "string" && ALLOWED[key].has(value);
}

interface OwnRead {
  readonly absent: boolean;
  readonly value: unknown;
}

// A hostile object can throw from a getter; validation must never throw, so a failed read
// is reported as a rejected value instead.
function readOwn(input: object, key: StateKey): OwnRead {
  try {
    const value = Object.hasOwn(input, key) ? (input as Record<string, unknown>)[key] : undefined;
    return { absent: value === undefined, value };
  } catch {
    return { absent: false, value: undefined };
  }
}

function isObject(input: unknown): input is object {
  if (typeof input !== "object" || input === null) return false;
  try {
    return !Array.isArray(input);
  } catch {
    // Array.isArray throws on a revoked Proxy.
    return false;
  }
}

export function validateVariations(input: unknown): ValidatedVariations {
  const valid: Partial<Writable<VariationState>> = {};
  const rejected: RejectedVariation[] = [];
  if (!isObject(input)) return { valid, rejected };
  for (const key of STATE_KEYS) {
    const { absent, value } = readOwn(input, key);
    if (absent) continue;
    if (isVariationId(key, value)) setValid(valid, key, value);
    else rejected.push({ axis: key, value });
  }
  return { valid, rejected };
}

function setValid<Key extends StateKey>(
  target: Partial<Writable<VariationState>>,
  key: Key,
  value: VariationState[Key],
): void {
  target[key] = value;
}

/** Keeps the valid axes and drops the rest. Use `validateVariations` to learn what was dropped. */
export function parseVariations(input: unknown): Partial<VariationState> {
  return validateVariations(input).valid;
}
