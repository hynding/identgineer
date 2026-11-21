/** How long a pause in typing starts a new search, as in the WAI-ARIA menu and listbox patterns. */
export const TYPEAHEAD_RESET_MS = 500;

/** Collects the characters typed in quick succession into one search string. */
export class TypeaheadBuffer {
  private text = "";
  private last = Number.NEGATIVE_INFINITY;

  push(character: string, time: number): string {
    this.text = time - this.last > TYPEAHEAD_RESET_MS ? character : this.text + character;
    this.last = time;
    return this.text;
  }
}

function isRepeat(query: string): boolean {
  const first = query.charAt(0);
  return query.length > 1 && query.split(first).every((part) => part === "");
}

/**
 * The item a typed search moves to: the first label that starts with the text, looking from the
 * item after the current one and wrapping. A single character typed again and again cycles through
 * the items that start with it. A longer search may stay on the current item.
 */
export function typeaheadMatch(
  labels: readonly string[],
  current: number,
  query: string,
): number | undefined {
  const repeat = isRepeat(query);
  const text = (repeat ? query.charAt(0) : query).toLocaleLowerCase();
  const count = labels.length;
  const firstOffset = text.length > 1 ? 0 : 1;
  for (let step = 0; step < count; step += 1) {
    const index = (current + firstOffset + step + count) % count;
    const label = (labels[index] ?? "").trim().toLocaleLowerCase();
    if (label.startsWith(text)) return index;
  }
  return undefined;
}
