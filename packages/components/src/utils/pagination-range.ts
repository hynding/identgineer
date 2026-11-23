export type PaginationToken = number | "start-ellipsis" | "end-ellipsis";

export interface PaginationRangeOptions {
  /** The current page, from 1. A page outside the range is moved into it. */
  page: number;
  pageCount: number;
  /** Pages shown on each side of the current one. */
  siblings?: number;
  /** Pages always shown at each end. */
  boundaries?: number;
}

const DEFAULT_SIBLINGS = 1;
const DEFAULT_BOUNDARIES = 1;

// More slots than this do not fit a row.
const MAX_SLOTS = 10;
/**
 * The most pages a pager counts: ten million, so no page number is longer than eight digits and a
 * button always fits a narrow page. A count above it is held to it.
 */
export const MAX_PAGE_COUNT = 10_000_000;

function wholeNumber(value: number | undefined, fallback: number, minimum: number): number {
  return value !== undefined && Number.isInteger(value) && value >= minimum
    ? Math.min(value, MAX_SLOTS)
    : fallback;
}

function range(start: number, end: number): number[] {
  const pages: number[] = [];
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

/**
 * The page numbers to show, with an ellipsis where pages are left out. The list keeps one length
 * (2 x boundaries + 2 x siblings + 3 slots) wherever the current page is, so the controls do not
 * shift as the reader pages through, and an ellipsis never stands for a single page: that page is
 * shown instead.
 */
export function paginationRange(options: PaginationRangeOptions): PaginationToken[] {
  const count = Math.min(
    Math.max(0, Math.trunc(Number.isFinite(options.pageCount) ? options.pageCount : 0)),
    MAX_PAGE_COUNT,
  );
  const siblings = wholeNumber(options.siblings, DEFAULT_SIBLINGS, 0);
  const boundaries = wholeNumber(options.boundaries, DEFAULT_BOUNDARIES, 0);
  const current = Number.isFinite(options.page)
    ? Math.min(Math.max(Math.trunc(options.page), 1), Math.max(count, 1))
    : 1;

  const startPages = range(1, Math.min(boundaries, count));
  const endPages = range(Math.max(count - boundaries + 1, boundaries + 1), count);

  const windowStart = Math.max(
    Math.min(current - siblings, count - boundaries - siblings * 2 - 1),
    boundaries + 2,
  );
  const windowEnd = Math.min(
    Math.max(current + siblings, boundaries + siblings * 2 + 2),
    endPages[0] === undefined ? count - 1 : endPages[0] - 2,
  );

  const beforeWindow: PaginationToken[] =
    windowStart > boundaries + 2
      ? ["start-ellipsis"]
      : boundaries + 1 < count - boundaries
        ? [boundaries + 1]
        : [];
  const afterWindow: PaginationToken[] =
    windowEnd < count - boundaries - 1
      ? ["end-ellipsis"]
      : count - boundaries > boundaries
        ? [count - boundaries]
        : [];

  return [
    ...startPages,
    ...beforeWindow,
    ...range(windowStart, windowEnd),
    ...afterWindow,
    ...endPages,
  ];
}
