const MAX_RETRY_AFTER_SECONDS = 3600;
const MAX_HEADER_LENGTH = 100;

const clamp = (seconds: number): number =>
  Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(0, Math.ceil(seconds)));

/**
 * A `Retry-After` header (delay seconds or an HTTP date) as whole seconds to wait, at most an
 * hour; `undefined` for anything else, which the caller answers with its own backoff.
 */
export const parseRetryAfter = (
  header: string | null | undefined,
  now: number,
): number | undefined => {
  if (typeof header !== "string" || header.length > MAX_HEADER_LENGTH) return undefined;
  const value = header.trim();
  if (/^\d+$/.test(value)) return clamp(Number(value));
  // An HTTP date has a month name: a bare number or an ISO date is not one.
  if (!/[a-z]/i.test(value)) return undefined;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : clamp((date - now) / 1000);
};
