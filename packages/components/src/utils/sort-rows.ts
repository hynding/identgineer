export type SortDirection = "ascending" | "descending";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function asNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : undefined;
}

/** Numbers compare as numbers, anything else by the reader's alphabet with digit runs in order. */
export function compareCellValues(a: string, b: string): number {
  const first = asNumber(a);
  const second = asNumber(b);
  if (first !== undefined && second !== undefined) return first - second;
  return collator.compare(a, b);
}

/**
 * The original positions of rows in sorted order. Rows that compare equal keep their order in
 * either direction, and empty cells come last in either direction, since a blank is the absence of
 * a value rather than the smallest one.
 */
export function sortedRowOrder(values: readonly string[], direction: SortDirection): number[] {
  const sign = direction === "ascending" ? 1 : -1;
  const filled: number[] = [];
  const empty: number[] = [];
  values.forEach((value, index) => {
    (value.trim() === "" ? empty : filled).push(index);
  });
  filled.sort(
    (left, right) =>
      sign * compareCellValues(values[left] ?? "", values[right] ?? "") || left - right,
  );
  return [...filled, ...empty];
}
