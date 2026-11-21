/**
 * The element that opens or is described by an overlay: the element named by `for` in the
 * overlay's own tree, or else the first child assigned to the given slot (`null` is the default
 * slot). The id is only ever passed to `getElementById`, never built into a selector.
 */
export function resolveTrigger(
  host: HTMLElement,
  slot: string | null,
  forId: string | undefined,
): HTMLElement | undefined {
  if (forId !== undefined && forId !== "") {
    const root = host.getRootNode() as Document | ShadowRoot;
    return root.getElementById(forId) ?? undefined;
  }
  const child = Array.from(host.children).find((candidate) =>
    slot === null ? !candidate.hasAttribute("slot") : candidate.getAttribute("slot") === slot,
  );
  return child as HTMLElement | undefined;
}
