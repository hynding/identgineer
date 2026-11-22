import { readTokenTimes } from "./token-expiry.ts";

export interface TokenLifetime {
  /** How long the access token lives from the moment it was received. */
  readonly ms: number;
  /** Whether the backend or the token said so, rather than the configured guess. */
  readonly known: boolean;
}

export interface LifetimeSource {
  readonly accessToken: string;
  readonly expiresIn?: number;
  readonly expiresAt?: string | number;
}

const positive = (ms: number): number | undefined =>
  Number.isFinite(ms) && ms > 0 ? ms : undefined;

const fromExpiresAt = (value: string | number | undefined, now: number): number | undefined => {
  if (value === undefined) return undefined;
  const at = typeof value === "number" ? value : Date.parse(value);
  return positive(at - now);
};

const fromToken = (accessToken: string, now: number): number | undefined => {
  const { issuedAt, expiresAt } = readTokenTimes(accessToken);
  if (expiresAt === undefined) return undefined;
  // exp - iat is the server's own measure, so a skewed local clock does not matter.
  if (issuedAt !== undefined) return positive(expiresAt - issuedAt);
  return positive(expiresAt - now);
};

/**
 * The access token's lifetime, measured from local receipt: the backend's `expiresIn`, then its
 * `expiresAt`, then a JWT's `exp - iat` (or `exp` against the local clock), and otherwise the
 * configured lifetime (strapi-php's tokens are opaque and its answers carry no expiry).
 */
export const tokenLifetime = (
  source: LifetimeSource,
  options: { readonly fallbackMs: number; readonly now: number },
): TokenLifetime => {
  const ms =
    positive((source.expiresIn ?? Number.NaN) * 1000) ??
    fromExpiresAt(source.expiresAt, options.now) ??
    fromToken(source.accessToken, options.now);
  return ms === undefined ? { ms: options.fallbackMs, known: false } : { ms, known: true };
};
