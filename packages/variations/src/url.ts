import { URL_PARAM_PREFIX } from "./constants.ts";
import { defaultVariations } from "./read-variations.ts";
import { REGISTRY, STATE_KEYS } from "./registry.ts";
import { parseVariations } from "./validate.ts";
import type { VariationState } from "./variation-state.ts";

export interface EncodeOptions {
  /** Leave out values equal to the default. Off by default, see `variationsUrl`. */
  readonly omitDefaults?: boolean;
}

const PARAMETER_NAMES: ReadonlySet<string> = new Set(
  STATE_KEYS.map((key) => `${URL_PARAM_PREFIX}${key}`),
);

/**
 * Encodes the valid axes it is given. Defaults are kept unless `omitDefaults` is set, because a
 * default left out means "whatever the recipient already chose", not "the default".
 */
export function encodeVariations(
  state: Partial<VariationState>,
  options: EncodeOptions = {},
): string {
  const valid = parseVariations(state);
  return STATE_KEYS.flatMap((key) => {
    const value = valid[key];
    if (value === undefined) return [];
    if (options.omitDefaults === true && value === REGISTRY[key].defaultId) return [];
    // Valid ids are plain lowercase ASCII, so they need no percent-encoding.
    return [`${URL_PARAM_PREFIX}${key}=${value}`];
  }).join("&");
}

/**
 * The query of whatever string was given: from the first `?` if there is one, up to the first
 * `#`. So `location.search`, `location.href`, a relative URL and a bare query all read the same,
 * and a hash is never mistaken for part of the last value. The `?` itself is kept, because
 * URLSearchParams drops exactly one: a second one stays in the name, as it does for the browser
 * and for the bootstrap script.
 */
function queryOf(input: string): string {
  const hashAt = input.indexOf("#");
  const withoutHash = hashAt === -1 ? input : input.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  return queryAt === -1 ? withoutHash : withoutHash.slice(queryAt);
}

export function decodeVariations(input: string | URLSearchParams): Partial<VariationState> {
  const params = typeof input === "string" ? new URLSearchParams(queryOf(input)) : input;
  const candidate: Record<string, string | null> = {};
  for (const key of STATE_KEYS) candidate[key] = params.get(`${URL_PARAM_PREFIX}${key}`);
  return parseVariations(candidate);
}

/** Whether the segment names one of the five parameters, however its name is escaped. */
function isOwnParameter(segment: string): boolean {
  const rawName = segment.split("=", 1)[0] ?? "";
  try {
    return PARAMETER_NAMES.has(decodeURIComponent(rawName.replaceAll("+", " ")));
  } catch {
    return false;
  }
}

/**
 * Always says all five choices, defaults and `scheme=system` included: a link that left a default
 * out would not reproduce what the sender saw for a recipient who has stored choices of their own.
 *
 * Splits the text rather than parsing it as a URL, so the base's path, other parameters and hash
 * come back byte for byte, and a relative base works. Only the five exact parameter names are
 * replaced; `idg-campaign` and the like are the site's own. It only reads `baseUrl`, never
 * `location`.
 */
export function variationsUrl(state: Partial<VariationState>, baseUrl: string): string {
  const hashAt = baseUrl.indexOf("#");
  const hash = hashAt === -1 ? "" : baseUrl.slice(hashAt);
  const withoutHash = hashAt === -1 ? baseUrl : baseUrl.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const existing = queryAt === -1 ? "" : withoutHash.slice(queryAt + 1);
  const kept =
    existing === "" ? [] : existing.split("&").filter((segment) => !isOwnParameter(segment));
  const complete = { ...defaultVariations(), ...parseVariations(state) };
  return `${path}?${[...kept, encodeVariations(complete)].join("&")}${hash}`;
}
