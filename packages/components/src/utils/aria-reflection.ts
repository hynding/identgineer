export function reflectControls(source: Element, targets: readonly Element[] | null): void {
  source.setAttribute("aria-controls", String(targets?.length ?? 0));
}

export function reflectLabelledBy(source: Element, targets: readonly Element[] | null): void {
  source.setAttribute("aria-labelledby", String(targets?.length ?? 0));
}
