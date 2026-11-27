import { parseBatch, parseBatchText, utf8Length, WRITE_KEY_PATTERN, type WireBatch } from "./batch";
import type { KeyLimiter } from "./key-limiter";
import { eventRowOf, type EventRow, type IngestPolicy } from "./normalise";
import type { IngestSettings } from "./settings";

/** The parts of a request the handler reads. Never the address, the user agent or a cookie. */
export interface IngestRequest {
  readonly contentType: string | undefined;
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
  /** The server's clock, in epoch milliseconds. */
  readonly now: () => number;
}

export type IngestAnswer =
  | { readonly status: 202 }
  | { readonly status: 400 | 403 | 404 | 413 | 415 }
  | { readonly status: 429; readonly retryAfterSeconds: number };

const ACCEPTED_TYPES = ["application/json", "text/plain"];

const mediaTypeOf = (header: string | undefined): string =>
  (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

const tooLarge = (request: IngestRequest, maxBytes: number): boolean => {
  const declared = (request.contentLength ?? "").trim();
  if (/^[0-9]+$/.test(declared) && Number(declared) > maxBytes) return true;
  return typeof request.body === "string" && utf8Length(request.body) > maxBytes;
};

const batchOf = (body: unknown) =>
  typeof body === "string" ? parseBatchText(body) : parseBatch(body);

const writeKeyOf = (batch: WireBatch, header: string | undefined): string | undefined => {
  const key = batch.transport === "beacon" ? batch.writeKey : header;
  return key !== undefined && WRITE_KEY_PATTERN.test(key) ? key : undefined;
};

/**
 * POST /api/ingest/events, after camis' guards (throttle per address, media type, body size):
 * checks in this order, so each refusal says the first thing wrong — type (415), size (413), batch
 * (400), key (404, alike for an unknown and an inactive one), origin (403), the key's rate (429) —
 * then stores each accepted event against the key's own property and answers 202 with no body.
 * Events not allowed, outside the time window or already stored are skipped silently.
 */
export const handleIngest = async <P extends IngestProperty>(
  request: IngestRequest,
  ports: IngestPorts<P>,
): Promise<IngestAnswer> => {
  if (!ACCEPTED_TYPES.includes(mediaTypeOf(request.contentType))) return { status: 415 };
  if (tooLarge(request, ports.settings.maxBodyBytes)) return { status: 413 };
  const parsed = batchOf(request.body);
  if (!parsed.ok) return { status: 400 };
  const batch = parsed.value;
  const writeKey = writeKeyOf(batch, request.writeKeyHeader);
  const property = writeKey === undefined ? undefined : await ports.findActiveProperty(writeKey);
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
    if (row !== undefined) await ports.storeEvent(property, row);
  }
  return { status: 202 };
};
