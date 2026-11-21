export interface ItemLike {
  readonly localName: string;
  hasAttribute(name: string): boolean;
}

// Elements the browser never draws, whatever their style.
const NEVER_DRAWN = ["template", "script", "style", "noscript", "link", "meta", "datalist"];

/** Whether an item is drawn: not hidden, and not an element that only holds data or code. */
export function isRendered(item: ItemLike): boolean {
  return !item.hasAttribute("hidden") && !NEVER_DRAWN.includes(item.localName);
}

export function renderedItems<T extends ItemLike>(items: readonly T[]): T[] {
  return items.filter(isRendered);
}

/**
 * The items drawn in one of a host's slots (`null` for the default slot). Once the slot exists it is
 * asked, so items another component forwards to it count too; before that the host's own children
 * stand in for it.
 */
export function itemsInSlot(host: HTMLElement, name: string | null): Element[] {
  const slot = host.shadowRoot?.querySelector<HTMLSlotElement>(
    name === null ? "slot:not([name])" : `slot[name="${name}"]`,
  );
  const assigned = slot
    ? slot.assignedElements({ flatten: true })
    : Array.from(host.children).filter(
        (child) => (child.getAttribute("slot") ?? "") === (name ?? ""),
      );
  return renderedItems(assigned);
}

/**
 * Calls `onChange` when a child of the host is hidden or shown, or changes slot. Items added and
 * removed are reported by `slotchange`, which the component listens to itself. Returns a function
 * that stops watching. Where there is no MutationObserver, as in the mock DOM, it does nothing.
 */
export function watchItems(host: HTMLElement, onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(host, { subtree: true, attributes: true, attributeFilter: ["hidden", "slot"] });
  return () => {
    observer.disconnect();
  };
}
