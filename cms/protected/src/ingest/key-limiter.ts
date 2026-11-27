/** A request's verdict: on, or refused until the window turns. */
export type LimitVerdict =
  { readonly kind: "allowed" } | { readonly kind: "limited"; readonly retryAfterSeconds: number };

export interface KeyLimiter {
  readonly hit: (key: string) => LimitVerdict;
}

export interface KeyLimiterOptions {
  readonly perMinute: number;
  /** Keys counted apart in one window; beyond it they share one count limited to `perMinute`. */
  readonly maxTracked: number;
  /** A monotonic clock in milliseconds, so a step of the wall clock changes nothing. */
  readonly now: () => number;
}

const WINDOW_MS = 60_000;
const OVERFLOW = Symbol("overflow");

/**
 * Counts requests per key in fixed minute windows, in this process's memory, as camis' endpoint
 * throttle does on Strapi. Memory stays bounded: at most `maxTracked` keys a window, the rest
 * sharing one count, and every count is dropped when the window turns.
 */
export const createKeyLimiter = (options: KeyLimiterOptions): KeyLimiter => {
  let windowStart = options.now();
  let counts = new Map<string | typeof OVERFLOW, number>();
  return {
    hit: (key) => {
      const now = options.now();
      if (now - windowStart >= WINDOW_MS) {
        windowStart += Math.floor((now - windowStart) / WINDOW_MS) * WINDOW_MS;
        counts = new Map();
      }
      const slot = counts.has(key) || counts.size < options.maxTracked ? key : OVERFLOW;
      const count = (counts.get(slot) ?? 0) + 1;
      counts.set(slot, count);
      return count <= options.perMinute
        ? { kind: "allowed" }
        : {
            kind: "limited",
            retryAfterSeconds: Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000)),
          };
    },
  };
};
