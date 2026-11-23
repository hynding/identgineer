import { parseJson } from "./parse-json.ts";

export interface TokenTimes {
  /** `exp`, in milliseconds. */
  readonly expiresAt?: number;
  /** `iat`, in milliseconds. */
  readonly issuedAt?: number;
}

const decodeBase64Url = (segment: string): string => {
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const claimMs = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value * 1000 : undefined;

/**
 * What a JWT access token says about when it was issued and expires, or nothing for an opaque
 * token or anything unreadable. Used only to schedule a refresh: the server decides what is valid.
 */
export const readTokenTimes = (token: string): TokenTimes => {
  const parts = token.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || payload === undefined) return {};
  try {
    const claims = parseJson(decodeBase64Url(payload));
    if (typeof claims !== "object" || claims === null || Array.isArray(claims)) return {};
    const { iat, exp } = claims as Readonly<Record<string, unknown>>;
    const expiresAt = claimMs(exp);
    if (expiresAt === undefined) return {};
    const issuedAt = claimMs(iat);
    return issuedAt === undefined ? { expiresAt } : { issuedAt, expiresAt };
  } catch {
    return {};
  }
};
