const PROPERTIES = ["ariaControlsElements", "ariaLabelledByElements"] as const;

/**
 * Stencil's mock DOM has no ARIA element reflection, so a component that feature-detects it would
 * skip the relation. Plain properties are installed on elements, which lets a spec read what the
 * component set. Whether a browser exposes the relation is checked in the browser tests.
 */
export function installAriaReflection(): void {
  const prototype = Object.getPrototypeOf(
    Object.getPrototypeOf(document.createElement("div")),
  ) as object;
  for (const name of PROPERTIES) {
    if (Object.prototype.hasOwnProperty.call(prototype, name)) continue;
    const values = new WeakMap<object, unknown>();
    Object.defineProperty(prototype, name, {
      configurable: true,
      get(this: object) {
        return values.get(this) ?? null;
      },
      set(this: object, value: unknown) {
        values.set(this, value);
      },
    });
  }
}
