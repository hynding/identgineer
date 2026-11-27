import { parseBatch, parseBatchText, utf8Length, WRITE_KEY_PATTERN, type WireBatch } from "./batch";
import type { KeyLimiter } from "./key-limiter";
import { eventRowOf, type EventRow, type IngestPolicy } from "./normalise";
import type { IngestSettings } from "./settings";

/** The parts of a request the handler reads. Never the address, the user agent or a cookie. */
export interface IngestRequest {
  readonly contentType: string | undefined;
  /** Every Content-Encoding the request names, joined; undefined when it names none. */
  readonly contentEncoding: string | undefined;
  readonly contentLength: string | undefined;
  readonly origin: string | undefined;
  readonly writeKeyHeader: string | undefined;
  /** As the body parser left it: text for text/plain, a parsed value for JSON. */
  readonly body: unknown;
}

/** An active property, found by its key. */
export interface IngestProperty extends IngestPolicy {
  readonly id: number;
  readonly allowedOrigins: ReadonlySet<string>;
}

export interface IngestPorts<P extends IngestProperty> {
  /** The property whose key this is, only when it is active; one lookup for both conditions. */
  readonly findActiveProperty: (writeKey: string) => Promise<P | undefined>;
  /** Stores the row, or reports that an event with its dedupeKey is already stored. */
  readonly storeEvent: (property: P, row: EventRow) => Promise<"stored" | "duplicate">;
  readonly limiter: KeyLimiter;
  readonly settings: IngestSettings;
  /**
   * Told that the database failed at a stage, with the error's class only: never its message,
   * which may hold the query and its bindings (the key, the body's values).
   */
  readonly reportFailure: (stage: "lookup" | "store", errorName: string) => void;
  /** The server's clock, in epoch milliseconds. */
  readonly now: () => number;
}

export type IngestAnswer =
  | { readonly status: 202 }
  | { readonly status: 400 | 403 | 404 | 413 | 415 | 503 }
  | { readonly status: 429; readonly retryAfterSeconds: number };

const ACCEPTED_TYPES = ["application/json", "text/plain"];

const mediaTypeOf = (header: string | undefined): string =>
  (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

/**
 * Strapi's body parser inflates gzip, deflate and br before the handler runs, so a compressed body
 * would pass every size check on its compressed length; no encoding but identity is taken.
 */
const encoded = (header: string | undefined): boolean =>
  (header ?? "")
    .split(",")
    .map((coding) => coding.trim().toLowerCase())
    .some((coding) => coding !== "identity" && coding !== "");

/**
 * The declared length, then the body itself: text by its UTF-8 bytes, and a value the JSON parser
 * already decoded by the bytes of its JSON, which is at most what was sent but for numbers sent in
 * exponent form (the SDK never sends one). The encoding refusal is what holds the cap there.
 */
const tooLarge = (request: IngestRequest, maxBytes: number): boolean => {
  const declared = (request.contentLength ?? "").trim();
  if (/^[0-9]+$/.test(declared) && Number(declared) > maxBytes) return true;
  if (typeof request.body === "string") return utf8Length(request.body) > maxBytes;
  const json = JSON.stringify(request.body);
  return typeof json === "string" && utf8Length(json) > maxBytes;
};

const errorName = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

/** Runs a database step; undefined when it threw, which has been reported. */
const guarded = async <T>(
  stage: "lookup" | "store",
  step: () => Promise<T>,
  report: IngestPorts<IngestProperty>["reportFailure"],
): Promise<{ readonly value: T } | undefined> => {
  try {
    return { value: await step() };
  } catch (error) {
    report(stage, errorName(error));
    return undefined;
  }
};

const batchOf = (body: unknown) =>
  typeof body === "string" ? parseBatchText(body) : parseBatch(body);

const writeKeyOf = (batch: WireBatch, header: string | undefined): string | undefined => {
  const key = batch.transport === "beacon" ? batch.writeKey : header;
  return key !== undefined && WRITE_KEY_PATTERN.test(key) ? key : undefined;
};

/**
 * POST /api/ingest/events, after camis' guards (throttle per address, media type, body size):
 * checks in this order, so each refusal says the first thing wrong — type or encoding (415), size
 * (413), batch (400), key (404, alike for an unknown and an inactive one), origin (403), the key's
 * rate (429) — then stores each accepted event against the key's own property and answers 202 with
 * no body. Events not allowed, outside the time window or already stored are skipped silently. A
 * database failure answers 503, which the SDK retries; events stored before it are skipped then.
 */
export const handleIngest = async <P extends IngestProperty>(
  request: IngestRequest,
  ports: IngestPorts<P>,
): Promise<IngestAnswer> => {
  if (!ACCEPTED_TYPES.includes(mediaTypeOf(request.contentType))) return { status: 415 };
  if (encoded(request.contentEncoding)) return { status: 415 };
  if (tooLarge(request, ports.settings.maxBodyBytes)) return { status: 413 };
  const parsed = batchOf(request.body);
  if (!parsed.ok) return { status: 400 };
  const batch = parsed.value;
  const writeKey = writeKeyOf(batch, request.writeKeyHeader);
  const found =
    writeKey === undefined
      ? { value: undefined }
      : await guarded("lookup", () => ports.findActiveProperty(writeKey), ports.reportFailure);
  if (found === undefined) return { status: 503 };
  const property = found.value;
  if (property === undefined) return { status: 404 };
  if (request.origin === undefined || !property.allowedOrigins.has(request.origin)) {
    return { status: 403 };
  }
  const verdict = ports.limiter.hit(String(property.id));
  if (verdict.kind === "limited")
    return { status: 429, retryAfterSeconds: verdict.retryAfterSeconds };
  const now = ports.now();
  for (const event of batch.events) {
    const row = eventRowOf(event, { propertyId: property.id, sentAt: batch.sentAt, now }, property);
    if (row === undefined) continue;
    const stored = await guarded(
      "store",
      () => ports.storeEvent(property, row),
      ports.reportFailure,
    );
    if (stored === undefined) return { status: 503 };
  }
  return { status: 202 };
};
