/** What to wait when a 429 does not say, or CORS hides the header. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_RETRY_AFTER_SECONDS = 3600;

const clamp = (seconds: number): number =>
  Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.ceil(seconds)));

/** A `Retry-After` header (delay seconds or an HTTP date) as whole seconds to wait. */
export function parseRetryAfter(header: string | null, now: number): number {
  if (header === null) return DEFAULT_RETRY_AFTER_SECONDS;
  const value = header.trim();
  if (/^\d+$/.test(value)) return clamp(Number(value));
  const date = Date.parse(value);
  if (!/[a-z]/i.test(value) || Number.isNaN(date)) return DEFAULT_RETRY_AFTER_SECONDS;
  return clamp((date - now) / 1000);
}
