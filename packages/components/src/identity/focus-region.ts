// Focus management for the identity components that swap what they show: when the element that
// had focus is taken away, focus would fall back to the document, and a keyboard or screen reader
// user would lose their place. Focus goes to an element of the component's own, never to one the
// page owns: a tabindex written on a page element, a custom element host above all, would take it
// (and, for a host, its whole shadow tree) out of the Tab order for good.

/** Whether focus is on `host` or inside it, through any shadow root. */
export function focusWithin(host: HTMLElement): boolean {
  const active = (host.getRootNode() as Document | ShadowRoot).activeElement;
  return active !== null && (active === host || host.contains(active));
}

/**
 * Also true when focus was dropped to the document, as it is when the focused element is removed:
 * for a component whose own action removed it.
 */
export function focusWithinOrLost(host: HTMLElement): boolean {
  const active = (host.getRootNode() as Document | ShadowRoot).activeElement;
  return active === null || active === host.ownerDocument.body || focusWithin(host);
}

/**
 * Focuses `element` when it takes focus as it is, and says whether it did. Nothing is written on
 * it: an element that is not focusable is left alone.
 */
export function focusIfFocusable(element: Element | null | undefined): boolean {
  if (!(element instanceof HTMLElement)) return false;
  element.focus();
  return element.matches(":focus, :focus-within");
}

/** The first element the slot shows, whether assigned or forwarded. */
export function firstAssigned(slot: HTMLSlotElement | null | undefined): Element | undefined {
  if (!slot) return undefined;
  if (typeof slot.assignedElements === "function") {
    return slot.assignedElements({ flatten: true })[0];
  }
  return undefined;
}
