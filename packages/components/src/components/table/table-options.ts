import type { SortDirection } from "../../utils/sort-rows";

export const SORT_DIRECTIONS = [
  "ascending",
  "descending",
] as const satisfies readonly SortDirection[];

/** Detail of `idgSort`: the column the user chose and the direction it is now sorted in. */
export interface TableSortDetail {
  key: string;
  direction: SortDirection;
}
