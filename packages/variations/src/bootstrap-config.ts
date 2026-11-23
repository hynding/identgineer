import { MAX_STORED_LENGTH, STORAGE_KEY, URL_PARAM_PREFIX } from "./constants.ts";
import { REGISTRY, STATE_KEYS } from "./registry.ts";

/** Keys are single letters: this literal is embedded in a script that has a 2 KB budget. */
export interface BootstrapConfig {
  /** Storage key. */
  readonly k: string;
  /** Longest stored value that is read. */
  readonly m: number;
  /** URL parameter prefix. */
  readonly p: string;
  /** Per axis: its name, its attribute and the ids that may be applied. */
  readonly a: readonly (readonly [string, string, readonly string[]])[];
}

/** The only place the script's allowlists come from, so they are the registry's own. */
export function bootstrapConfig(): BootstrapConfig {
  return {
    k: STORAGE_KEY,
    m: MAX_STORED_LENGTH,
    p: URL_PARAM_PREFIX,
    a: STATE_KEYS.map((key) => [
      key,
      REGISTRY[key].attribute,
      key === "scheme"
        ? [...REGISTRY.scheme.ids]
        : REGISTRY[key].variations.map((variation) => variation.id),
    ]),
  };
}
