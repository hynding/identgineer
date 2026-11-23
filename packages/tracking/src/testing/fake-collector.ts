import type { FetchInit, FetchLike, FetchResponseLike, SendBeaconLike } from "../fetch-like.ts";
import { parseTrackingBatch } from "../parse-tracking-batch.ts";
import { utf8Length } from "../utf8-length.ts";
import type { TrackingBatch, TrackingEvent } from "../wire-format.ts";

export type CollectorAnswer =
  | { readonly status: number; readonly headers?: Readonly<Record<string, string>> }
  | "network-error"
  | "hang";

export interface RecordedRequest {
  readonly via: "fetch" | "beacon";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly bytes: number;
  readonly keepalive: boolean;
  /** True while a fetch is unanswered; false once it is answered, aborted or failed. */
  pending: boolean;
  /** The status it was answered with; `undefined` while it hangs or when the network failed. */
  status?: number;
}

export interface FakeCollectorOptions {
  readonly endpoint: string;
  readonly writeKey: string;
  /** Default 32768, the SDK's default `maxPayloadBytes`. */
  readonly maxPayloadBytes?: number;
}

/**
 * A collector endpoint for tests. It records every request, checks each one against the contract
 * (URL, headers, request options, payload cap, a valid batch, one request in flight, the key in the
 * header for fetch and in the body for a beacon) and lists what it found in `violations`.
 */
export interface FakeCollector {
  readonly fetch: FetchLike;
  readonly sendBeacon: SendBeaconLike;
  readonly requests: readonly RecordedRequest[];
  readonly violations: readonly string[];
  /** Fetches that have not been answered, and the most there ever were at once. */
  readonly inFlight: number;
  readonly maxInFlight: number;
  beaconAccepts: boolean;
  /** Queues answers for the next requests; after them the default answers. */
  readonly answer: (...answers: CollectorAnswer[]) => void;
  readonly setDefault: (answer: CollectorAnswer) => void;
  /** Answers every hanging fetch (202 unless told otherwise). */
  readonly releaseHanging: (answer?: { status: number }) => void;
  readonly onRequest: (listener: (request: RecordedRequest) => void) => void;
  /** Every request's body that passed `parseTrackingBatch`, answered or not. */
  readonly batches: () => TrackingBatch[];
  /** The events of the requests it answered 2xx, duplicates included. */
  readonly deliveredEvents: () => TrackingEvent[];
}

const DEFAULT_MAX_PAYLOAD_BYTES = 32_768;

const toResponse = (answer: {
  status: number;
  headers?: Readonly<Record<string, string>>;
}): FetchResponseLike => ({
  status: answer.status,
  headers: new Headers(answer.headers),
});

export const createFakeCollector = (options: FakeCollectorOptions): FakeCollector => {
  const { endpoint, writeKey } = options;
  const cap = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const requests: RecordedRequest[] = [];
  const violations: string[] = [];
  const script: CollectorAnswer[] = [];
  const observers: ((request: RecordedRequest) => void)[] = [];
  const hanging: ((answer: { status: number }) => void)[] = [];
  let fallback: CollectorAnswer = { status: 202 };
  let inFlight = 0;
  let maxInFlight = 0;

  const check = (request: RecordedRequest, init: FetchInit | undefined): void => {
    const flag = (message: string): void => {
      violations.push(message);
    };
    if (request.url !== endpoint) flag(`url: ${request.url} is not the endpoint`);
    if (request.url.includes(writeKey)) flag("url: it carries the write key");
    if (request.bytes > cap)
      flag(`payload: ${String(request.bytes)} bytes exceed the cap of ${String(cap)}`);
    let decoded: unknown;
    try {
      decoded = JSON.parse(request.body);
    } catch {
      flag("json: the body is not JSON");
      return;
    }
    const parsed = parseTrackingBatch(decoded);
    if (!parsed.ok) flag(`batch: ${parsed.error}`);
    // Read from the raw body, so a contract break is named even when the batch is also invalid.
    const raw = (typeof decoded === "object" && decoded !== null ? decoded : {}) as Record<
      string,
      unknown
    >;
    const bodyKey = raw.writeKey;
    const sentAs = init === undefined ? "beacon" : "fetch";
    if (raw.transport !== sentAs) {
      flag(
        `transport: a ${sentAs} must say so, and this one says ${JSON.stringify(raw.transport)}`,
      );
    }
    if (init === undefined) {
      if (bodyKey !== writeKey) flag("write key: a beacon must carry it in its body");
      return;
    }
    if (bodyKey !== undefined) flag("body key: a fetch body must not carry the write key");
    if (request.headers["X-Idg-Write-Key"] !== writeKey)
      flag("write key: the header is missing or wrong");
    if (request.headers["Content-Type"] !== "application/json")
      flag("content type: must be application/json");
    if ((init.credentials as string) !== "omit") flag("credentials: must be omit");
    if ((init.mode as string) !== "cors") flag("mode: must be cors");
    if ((init.referrerPolicy as string) !== "no-referrer")
      flag("referrer policy: must be no-referrer");
    if ((init.cache as string) !== "no-store") flag("cache: must be no-store");
  };

  const record = (
    via: "fetch" | "beacon",
    url: string,
    headers: Readonly<Record<string, string>>,
    body: string,
    keepalive: boolean,
    init: FetchInit | undefined,
  ): RecordedRequest => {
    const request: RecordedRequest = {
      via,
      url,
      headers,
      body,
      bytes: utf8Length(body),
      keepalive,
      pending: false,
    };
    requests.push(request);
    check(request, init);
    for (const observer of observers) observer(request);
    return request;
  };

  const next = (): CollectorAnswer => script.shift() ?? fallback;

  const collector: FakeCollector = {
    requests,
    violations,
    get inFlight() {
      return inFlight;
    },
    get maxInFlight() {
      return maxInFlight;
    },
    beaconAccepts: true,
    answer: (...answers) => {
      script.push(...answers);
    },
    setDefault: (answer) => {
      fallback = answer;
    },
    onRequest: (listener) => {
      observers.push(listener);
    },
    releaseHanging: (answer = { status: 202 }) => {
      for (const release of hanging.splice(0)) release(answer);
    },
    fetch: (url, init) => {
      const request = record("fetch", url, init.headers, init.body, init.keepalive === true, init);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (inFlight > 1) violations.push(`in flight: ${String(inFlight)} requests at once`);
      const answer = next();
      request.pending = answer === "hang";
      const settle = <T>(finish: () => T): T => {
        request.pending = false;
        inFlight -= 1;
        return finish();
      };
      if (answer === "network-error") {
        return Promise.resolve().then(() =>
          settle(() => Promise.reject(new TypeError("Failed to fetch"))),
        );
      }
      if (answer === "hang") {
        return new Promise((resolve, reject) => {
          let open = true;
          const finish = (act: () => void): void => {
            if (!open) return;
            open = false;
            settle(act);
          };
          hanging.push((released) => {
            request.status = released.status;
            finish(() => {
              resolve(toResponse(released));
            });
          });
          init.signal?.addEventListener(
            "abort",
            () => {
              finish(() => {
                reject(new DOMException("The operation was aborted.", "AbortError"));
              });
            },
            { once: true },
          );
        });
      }
      request.status = answer.status;
      return Promise.resolve().then(() => settle(() => toResponse(answer)));
    },
    sendBeacon: (url, data) => {
      if (!collector.beaconAccepts) return false;
      const request = record("beacon", url, {}, data, true, undefined);
      if (typeof fallback === "object") request.status = fallback.status;
      return true;
    },
    batches: () =>
      requests.flatMap((request) => {
        try {
          const parsed = parseTrackingBatch(JSON.parse(request.body));
          return parsed.ok ? [parsed.value] : [];
        } catch {
          return [];
        }
      }),
    deliveredEvents: () =>
      requests
        .filter(
          (request) =>
            request.status !== undefined && request.status >= 200 && request.status < 300,
        )
        .flatMap((request) => {
          const parsed = parseTrackingBatch(JSON.parse(request.body));
          return parsed.ok ? [...parsed.value.events] : [];
        }),
  };
  return collector;
};
