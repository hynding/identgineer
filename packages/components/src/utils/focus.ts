/** The element that really has focus, looking inside open shadow roots. */
export function deepActiveElement(root: DocumentOrShadowRoot = document): Element | null {
  let active = root.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** The parent of a node, stepping from a shadow root out to its host. */
export function shadowIncludingParent(node: Node): Node | null {
  const parent = node.parentNode;
  return parent instanceof ShadowRoot ? parent.host : parent;
}

/** Whether a node is the container or inside it, across shadow boundaries. */
export function isWithin(node: Node | null, container: Node): boolean {
  for (let current = node; current; current = shadowIncludingParent(current)) {
    if (current === container) return true;
  }
  return false;
}

/** The node's ancestors, nearest first, across shadow boundaries. */
export function shadowIncludingAncestors(node: Node): Node[] {
  const ancestors: Node[] = [];
  for (let current = shadowIncludingParent(node); current; current = shadowIncludingParent(current)) {
    ancestors.push(current);
  }
  return ancestors;
}

// What is rendered inside an element: its shadow tree if it has one, the elements assigned to a
// slot (or the slot's fallback when nothing is), and otherwise its children.
function renderedChildren(node: Element | ShadowRoot): Element[] {
  if (node instanceof HTMLSlotElement) {
    const assigned = node.assignedElements({ flatten: true });
    if (assigned.length > 0) return assigned;
  }
  const container = node instanceof Element && node.shadowRoot ? node.shadowRoot : node;
  return Array.from(container.children);
}

export function isFocusable(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.tabIndex < 0) return false;
  if ((element as HTMLElement & { disabled?: boolean }).disabled === true) return false;
  return element.checkVisibility() && element.closest("[inert]") === null;
}

/** The first element keyboard focus can reach, in the order it is rendered (the flat tree). */
export function firstFocusable(root: Element | ShadowRoot): HTMLElement | undefined {
  for (const child of renderedChildren(root)) {
    if (isFocusable(child)) return child;
    const inside = firstFocusable(child);
    if (inside) return inside;
  }
  return undefined;
}

/**
 * Focuses an element, or when it cannot take focus itself (such as a custom element whose control
 * is in its shadow root) the first focusable element inside it. Returns whether focus got there.
 */
export function focusInto(element: Element): boolean {
  if (element instanceof HTMLElement) element.focus();
  if (isWithin(deepActiveElement(), element)) return true;
  const inside = firstFocusable(element);
  inside?.focus();
  return inside !== undefined && isWithin(deepActiveElement(), inside);
}
