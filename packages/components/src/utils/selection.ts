export interface SelectableItem {
  value: string;
  disabled: boolean;
}

function nearestEnabled(items: readonly SelectableItem[], from: number): string | undefined {
  for (let index = from; index < items.length; index += 1) {
    const item = items[index];
    if (item && !item.disabled) return item.value;
  }
  for (let index = Math.min(from, items.length) - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && !item.disabled) return item.value;
  }
  return undefined;
}

/**
 * The value that should be selected in a list whose items can come, go and be disabled. The
 * requested value stays when it exists and is enabled. Otherwise the enabled item nearest the
 * place the selection was takes over, looking forward first because that is the item that moved
 * into a removed item's place. `previousIndex` is where the selection was.
 */
export function resolveSelection(
  items: readonly SelectableItem[],
  requested: string,
  previousIndex: number,
): string | undefined {
  const matchIndex = items.findIndex((item) => item.value === requested);
  const match = items[matchIndex];
  if (match && !match.disabled) return match.value;
  return nearestEnabled(items, match ? matchIndex : Math.max(0, previousIndex));
}
