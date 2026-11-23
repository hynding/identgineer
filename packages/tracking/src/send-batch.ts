import type { FetchLike, SendBeaconLike } from "./fetch-like.ts";
import { parseRetryAfter } from "./retry-after.ts";

export type SendOutcome =
  | { readonly kind: "delivered" }
  | { readonly kind: "retry"; readonly retryAfterSeconds?: number }
  | { readonly kind: "rejected"; readonly status: number };

export interface FetchSender {
  readonly fetch: FetchLike;
  readonly endpoint: string;
  readonly writeKey: string;
  readonly now: () => number;
}

const retryAfterOf = (headers: { get: (name: string) => string | null }, now: number) => {
  try {
    return parseRetryAfter(headers.get("Retry-After"), now);
  } catch {
    return undefined;
  }
};

/**
 * One request. The write key travels in a header; the request carries no cookie, no referrer and
 * no cache entry, and a redirect is an error rather than a second place for the key to go.
 * A network failure, a 429 and a 5xx are worth a retry; any other answer settles the batch.
 */
export const sendByFetch = async (
  sender: FetchSender,
  body: string,
  keepalive: boolean,
): Promise<SendOutcome> => {
  // Called without a receiver, as `fetch` itself must be.
  const { fetch } = sender;
  try {
    const response = await fetch(sender.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Idg-Write-Key": sender.writeKey },
      body,
      credentials: "omit",
      mode: "cors",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      ...(keepalive ? { keepalive: true as const } : {}),
    });
    const status: unknown = response.status;
    if (typeof status !== "number") return { kind: "retry" };
    if (status >= 200 && status < 300) return { kind: "delivered" };
    if (status === 429 || status >= 500) {
      const retryAfterSeconds = retryAfterOf(response.headers, sender.now());
      return retryAfterSeconds === undefined
        ? { kind: "retry" }
        : { kind: "retry", retryAfterSeconds };
    }
    return { kind: "rejected", status };
  } catch {
    return { kind: "retry" };
  }
};

/** A beacon has no answer to read: `true` only means the browser took it. */
export const sendByBeacon = (
  sendBeacon: SendBeaconLike,
  endpoint: string,
  body: string,
): boolean => {
  try {
    return sendBeacon(endpoint, body);
  } catch {
    return false;
  }
};
