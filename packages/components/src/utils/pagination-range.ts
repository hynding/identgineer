export type PaginationToken = number | "start-ellipsis" | "end-ellipsis";

export interface PaginationRangeOptions {
  page: number;
  pageCount: number;
  siblings?: number;
  boundaries?: number;
}

export function paginationRange(options: PaginationRangeOptions): PaginationToken[] {
  return [options.page];
}
