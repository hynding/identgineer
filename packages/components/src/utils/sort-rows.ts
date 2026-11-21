export type SortDirection = "ascending" | "descending";

export function compareCellValues(a: string, b: string): number {
  return a < b ? -1 : 1;
}

export function sortedRowOrder(values: readonly string[], direction: SortDirection): number[] {
  return direction === "ascending" ? values.map((_value, index) => index) : [];
}
