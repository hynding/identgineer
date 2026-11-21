interface SlotChild {
  getAttribute(name: string): string | null;
  textContent: string | null;
}

/** The text of the light-DOM children assigned to a slot (`null` is the default slot). */
export function slottedText(host: { children: ArrayLike<SlotChild> }, slot: string | null): string {
  return Array.from(host.children)
    .filter((child) => child.getAttribute("slot") === slot)
    .map((child) => (child.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((text) => text !== "")
    .join(" ");
}
