import { deepActiveElement, shadowIncludingAncestors } from "../../utils/focus";

export interface Viewport {
  x: number;
  y: number;
  focused: Element | null;
}

/**
 * Calls `onChange` when `data-layout` changes on the host or on any element above it, which is
 * where the page sets the layout. Returns a function that stops watching.
 */
export function watchLayoutAttribute(host: Element, onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined") return () => undefined;
  const observer = new MutationObserver(onChange);
  const watched = [host, ...shadowIncludingAncestors(host)].filter(
    (node): node is Element => node.nodeType === 1,
  );
  for (const element of watched) {
    observer.observe(element, { attributes: true, attributeFilter: ["data-layout"] });
  }
  return () => {
    observer.disconnect();
  };
}

/** Where the page is scrolled and what has focus, to put back once a layout change has settled. */
export function takeViewport(
  view: Window,
  activeElement: () => Element | null = deepActiveElement,
): Viewport {
  return { x: view.scrollX, y: view.scrollY, focused: activeElement() };
}

/**
 * Puts the scroll position back. A change of layout alters the height of the page, and the browser
 * answers by clamping or anchoring the scroll, which would leave a reader somewhere else.
 */
export function restoreViewport(view: Window, taken: Viewport): void {
  if (view.scrollX === taken.x && view.scrollY === taken.y) return;
  view.scrollTo({ left: taken.x, top: taken.y, behavior: "instant" });
}
