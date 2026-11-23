import { deepActiveElement, isWithin } from "../utils/focus";

/** Where focus went: back to what had it, to the main landmark, or nowhere (the body). */
export type FocusReturn = "previous" | "main" | "body";

// A browser always has an active element (the body at least), so none (null, or undefined in a mock) means a document that does
// not track focus, which cannot say the element refused it.
function takesFocus(element: Element, doc: Document): boolean {
  (element as HTMLElement).focus();
  const active = deepActiveElement(doc) as Element | null | undefined;
  return active === null || active === undefined || isWithin(active, element);
}

function isLive(candidate: unknown, doc: Document): candidate is HTMLElement {
  const element = candidate as Partial<HTMLElement> | null | undefined;
  return (
    typeof element === "object" &&
    element !== null &&
    typeof element.focus === "function" &&
    element.isConnected === true &&
    doc.contains(element as Node)
  );
}

/**
 * Puts focus somewhere sensible after something that had it went away: on `previous`, the element
 * that had focus before the user came to what is now gone, if it is still on the page; else on
 * the page's main landmark; else nothing, which leaves it on the body.
 *
 * A landmark is not focusable as it is, and the page owns it, so it is given `tabindex="-1"` only
 * while it has focus and gets back what it had when it loses it.
 */
export function returnFocus(previous: unknown, doc: Document): FocusReturn {
  try {
    if (isLive(previous, doc) && takesFocus(previous, doc)) return "previous";
    const main = doc.querySelector<HTMLElement>("main, [role='main']");
    if (main === null) return "body";
    if (!main.hasAttribute("tabindex")) {
      main.setAttribute("tabindex", "-1");
      main.addEventListener(
        "blur",
        () => {
          main.removeAttribute("tabindex");
        },
        { once: true },
      );
    }
    main.focus();
    return "main";
  } catch {
    return "body";
  }
}
