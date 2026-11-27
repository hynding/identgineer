import { MAX_TRACKING_BATCH_BYTES } from "./batch";

/** The ingestion handler's limits, from the environment (cms/.env.example). */
export interface IngestSettings {
  /** INGEST_MAX_BODY_BYTES: at most the wire format's cap, which camis' guard enforces first. */
  readonly maxBodyBytes: number;
  /** INGEST_KEY_RATE_PER_MINUTE: requests a minute per property key, from every address. */
  readonly keyRatePerMinute: number;
}

export const DEFAULT_KEY_RATE_PER_MINUTE = 3000;

// As camis reads its throttle variables: whole numbers in ASCII digits, floored at 1; anything
// else keeps the default.
const wholeNumber = (value: string | undefined, fallback: number): number =>
  value !== undefined && /^[0-9]+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Math.max(1, Number(value))
    : fallback;

export const readIngestSettings = (
  env: Readonly<Record<string, string | undefined>>,
): IngestSettings => ({
  maxBodyBytes: Math.min(
    MAX_TRACKING_BATCH_BYTES,
    wholeNumber(env.INGEST_MAX_BODY_BYTES, MAX_TRACKING_BATCH_BYTES),
  ),
  keyRatePerMinute: wholeNumber(env.INGEST_KEY_RATE_PER_MINUTE, DEFAULT_KEY_RATE_PER_MINUTE),
});
