// Focus management for the identity components that swap what they show: when the element that
// had focus is taken away, focus would fall back to the document, and a keyboard or screen reader
// user would lose their place.

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex], [contenteditable]";

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

/** Focuses `element`, making it focusable from script first when it is not already. */
export function focusRegion(element: Element | null | undefined): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (!element.matches(FOCUSABLE)) element.setAttribute("tabindex", "-1");
  element.focus();
  return true;
}

/** The first element the slot shows, whether assigned or forwarded. */
export function firstAssigned(slot: HTMLSlotElement | null | undefined): Element | undefined {
  if (!slot) return undefined;
  if (typeof slot.assignedElements === "function") {
    return slot.assignedElements({ flatten: true })[0];
  }
  return undefined;
}
