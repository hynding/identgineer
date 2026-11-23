import { shadowIncludingParent } from "../utils/focus";

/**
 * The language to format for people in: the nearest `lang` going outwards from the element, through
 * shadow hosts (which `closest` does not cross), and then the document's. `undefined` leaves the
 * choice to the browser.
 */
export function languageOf(element: Element): string | undefined {
  for (let node: Node | null = element; node; node = shadowIncludingParent(node)) {
    const lang = (node as Partial<Element>).getAttribute?.("lang") ?? "";
    if (lang !== "") return lang;
  }
  const document = element.ownerDocument.documentElement.getAttribute("lang") ?? "";
  return document === "" ? undefined : document;
}
