import { parseJson } from "./parse-json.ts";

const decodeBase64Url = (segment: string): string => {
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/**
 * When a JWT access token says it expires, in milliseconds, or undefined for an opaque token or
 * anything unreadable. Used only to schedule a refresh: the server decides what is valid.
 */
export const readTokenExpiry = (token: string): number | undefined => {
  const parts = token.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || payload === undefined) return undefined;
  try {
    const claims = parseJson(decodeBase64Url(payload));
    if (typeof claims !== "object" || claims === null || Array.isArray(claims)) return undefined;
    const exp = (claims as Readonly<Record<string, unknown>>).exp;
    return typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
};
