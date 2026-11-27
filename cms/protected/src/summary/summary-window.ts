// The time the property summary covers (GET /api/properties/:id/summary), the same on both
// targets: app/Summary/SummaryWindow.php restates it, and both are held to
// cms/tests/fixtures/property-summary-vectors.json.

export const SUMMARY_RANGES = ["24h", "7d", "30d"] as const;
export type SummaryRange = (typeof SUMMARY_RANGES)[number];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const BUCKETS: Readonly<Record<SummaryRange, { readonly sizeMs: number; readonly count: number }>> =
  {
    "24h": { sizeMs: HOUR_MS, count: 24 },
    "7d": { sizeMs: DAY_MS, count: 7 },
    "30d": { sizeMs: DAY_MS, count: 30 },
  };

/**
 * The range and the one before it, in epoch milliseconds, each half-open ([from, to)). The range
 * ends where the UTC hour (24h) or day (7d, 30d) that holds `now` ends, so its last bucket is the
 * one in progress and every bucket is a whole UTC hour or day; the range before it is as long and
 * ends where the range starts. Unix time has no leap seconds, so a multiple of an hour or a day
 * from the epoch is the start of a UTC hour or day.
 */
export interface SummaryWindow {
  readonly range: SummaryRange;
  readonly bucketMs: number;
  /** The number of buckets in the range: 24, 7 or 30. */
  readonly buckets: number;
  readonly previousStart: number;
  readonly start: number;
  readonly end: number;
}

export const isSummaryRange = (value: unknown): value is SummaryRange =>
  typeof value === "string" && (SUMMARY_RANGES as readonly string[]).includes(value);

export function summaryWindow(nowMs: number, range: SummaryRange): SummaryWindow {
  const { sizeMs, count } = BUCKETS[range];
  const end = Math.floor(nowMs / sizeMs) * sizeMs + sizeMs;
  const start = end - count * sizeMs;
  return {
    range,
    bucketMs: sizeMs,
    buckets: count,
    previousStart: start - count * sizeMs,
    start,
    end,
  };
}

/** Where each bucket of the range starts after the first, oldest first: the `CASE` edges. */
export const bucketEdges = (window: SummaryWindow): number[] =>
  Array.from(
    { length: window.buckets - 1 },
    (_, index) => window.start + (index + 1) * window.bucketMs,
  );
