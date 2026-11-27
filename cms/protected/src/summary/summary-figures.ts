import type { SummaryWindow } from "./summary-window";

export interface SummaryMetric {
  readonly value: number;
  readonly previous: number;
  readonly series: number[];
}

export interface SummaryFigures {
  readonly visitors: SummaryMetric;
  readonly pageViews: SummaryMetric;
  readonly events: SummaryMetric;
}

/** A row of the bucket count as a driver returns it: counts may be strings (pg, MySQL's SUM). */
export type BucketRow = Readonly<Record<string, unknown>>;

/** A count as the database answered it; a driver may send it as a string, or SUM over no row as null. */
function count(value: unknown): number {
  const number = value === null || value === undefined ? 0 : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error("PropertySummary: the database answered a count that is not one");
  }
  return number;
}

const total = (series: readonly number[]): number => series.reduce((sum, item) => sum + item, 0);

/**
 * The figures from the two counts of `summaryQueries` (or their PHP twins): each bucket's row, the
 * range before as bucket -1, and the distinct sessions of each whole range. A bucket with no row
 * is 0. The distinct sessions of a range are counted over the range, not summed from its buckets,
 * so a visitor seen in two buckets counts once.
 */
export function summaryFigures(
  window: SummaryWindow,
  bucketRows: readonly BucketRow[],
  visitorRow: BucketRow | undefined,
): SummaryFigures {
  const events = new Array<number>(window.buckets).fill(0);
  const pageViews = new Array<number>(window.buckets).fill(0);
  const visitors = new Array<number>(window.buckets).fill(0);
  let previousEvents = 0;
  let previousPageViews = 0;
  for (const row of bucketRows) {
    const bucket = Number(row.bucket);
    if (bucket === -1) {
      previousEvents = count(row.events);
      previousPageViews = count(row.page_views);
      continue;
    }
    if (!Number.isInteger(bucket) || bucket < 0 || bucket >= window.buckets) {
      throw new Error("PropertySummary: the database answered a bucket outside the range");
    }
    events[bucket] = count(row.events);
    pageViews[bucket] = count(row.page_views);
    visitors[bucket] = count(row.visitors);
  }
  return {
    visitors: {
      value: count(visitorRow?.current_visitors),
      previous: count(visitorRow?.previous_visitors),
      series: visitors,
    },
    pageViews: { value: total(pageViews), previous: previousPageViews, series: pageViews },
    events: { value: total(events), previous: previousEvents, series: events },
  };
}
