interface ReflectedRelations {
  ariaControlsElements?: readonly Element[] | null;
  ariaLabelledByElements?: readonly Element[] | null;
}

/**
 * Element reflection makes an ARIA relation without an id, so it can cross a shadow boundary
 * outwards, which an id reference cannot. A browser without it exposes no relation, and the
 * element is left as it is.
 */
export function reflectControls(source: Element, targets: readonly Element[] | null): void {
  if ("ariaControlsElements" in source) {
    (source as ReflectedRelations).ariaControlsElements = targets;
  }
}

export function reflectLabelledBy(source: Element, targets: readonly Element[] | null): void {
  if ("ariaLabelledByElements" in source) {
    (source as ReflectedRelations).ariaLabelledByElements = targets;
  }
}
