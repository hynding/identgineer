export interface SelectableItem {
  value: string;
  disabled: boolean;
}

export function resolveSelection(
  items: readonly SelectableItem[],
  requested: string,
  previousIndex: number,
): string | undefined {
  return items[previousIndex]?.value ?? requested;
}
