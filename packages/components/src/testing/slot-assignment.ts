interface FakeSlot extends HTMLElement {
  assignedElements: (options?: { flatten?: boolean }) => Element[];
}

/**
 * Stencil's mock DOM has no slot assignment. A slot is given `assignedElements`, which returns the
 * host's children for the slot's name, so code that looks through slots can be tested.
 */
export function installSlotAssignment(): void {
  const prototype = Object.getPrototypeOf(
    Object.getPrototypeOf(document.createElement("div")),
  ) as FakeSlot;
  Object.defineProperty(prototype, "assignedElements", {
    configurable: true,
    writable: true,
    value(this: HTMLElement): Element[] {
      const root = this.getRootNode() as { host?: Element };
      const name = this.getAttribute("name") ?? "";
      return Array.from(root.host?.children ?? []).filter(
        (child) => (child.getAttribute("slot") ?? "") === name,
      );
    },
  });
}
