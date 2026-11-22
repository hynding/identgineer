import { URL_PARAM_PREFIX } from "./constants.ts";
import { REGISTRY, STATE_KEYS } from "./registry.ts";
import { parseVariations } from "./validate.ts";
import type { VariationState } from "./variation-state.ts";

/** Defaults are omitted: they are what a recipient gets anyway, and it keeps links short. */
export function encodeVariations(state: Partial<VariationState>): string {
  const valid = parseVariations(state);
  return STATE_KEYS.flatMap((key) => {
    const value = valid[key];
    // Valid ids are plain lowercase ASCII, so they need no percent-encoding.
    return value === undefined || value === REGISTRY[key].defaultId
      ? []
      : [`${URL_PARAM_PREFIX}${key}=${value}`];
  }).join("&");
}

export function decodeVariations(search: string | URLSearchParams): Partial<VariationState> {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const candidate: Record<string, string | null> = {};
  for (const key of STATE_KEYS) candidate[key] = params.get(`${URL_PARAM_PREFIX}${key}`);
  return parseVariations(candidate);
}

function isOwnParameter(segment: string): boolean {
  return segment.startsWith(URL_PARAM_PREFIX);
}

/**
 * Splits the text rather than parsing it as a URL, so the base's path, other parameters and hash
 * come back byte for byte, and a relative base works. It only reads `baseUrl`, never `location`.
 */
export function variationsUrl(state: Partial<VariationState>, baseUrl: string): string {
  const hashAt = baseUrl.indexOf("#");
  const hash = hashAt === -1 ? "" : baseUrl.slice(hashAt);
  const withoutHash = hashAt === -1 ? baseUrl : baseUrl.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const existing = queryAt === -1 ? [] : withoutHash.slice(queryAt + 1).split("&");
  const query = existing.filter((segment) => segment !== "" && !isOwnParameter(segment));
  const encoded = encodeVariations(state);
  if (encoded !== "") query.push(encoded);
  return `${path}${query.length > 0 ? `?${query.join("&")}` : ""}${hash}`;
}
