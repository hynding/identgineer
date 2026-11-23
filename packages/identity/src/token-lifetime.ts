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

// A year: anything longer is not a lifetime this client should trust.
const MAX_EXPIRES_IN_SECONDS = 31_536_000;

/** The backend's `expiresIn`: whole seconds, at least one and at most a year. */
const fromExpiresIn = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isInteger(value) && value >= 1 && value <= MAX_EXPIRES_IN_SECONDS
    ? value * 1000
    : undefined;

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
 * The access token's lifetime, measured from local receipt: the backend's `expiresIn` (as camis
 * answers in refresh mode), then its `expiresAt`, then a JWT's `exp - iat` (or `exp` against the
 * local clock), and otherwise the configured lifetime. What the backend says wins over the
 * configuration, which can only guess; an unusable value is skipped, not trusted.
 */
export const tokenLifetime = (
  source: LifetimeSource,
  options: { readonly fallbackMs: number; readonly now: number },
): TokenLifetime => {
  const ms =
    fromExpiresIn(source.expiresIn) ??
    fromExpiresAt(source.expiresAt, options.now) ??
    fromToken(source.accessToken, options.now);
  return ms === undefined ? { ms: options.fallbackMs, known: false } : { ms, known: true };
};
