/**
 * Stencil prerenders in its own small mock of the DOM, which lacks three things the components
 * reach for while they connect. Each is given the inert answer a browser gives before anything has
 * happened, so a component renders exactly what it would on its first frame in a browser:
 *
 * - `document.adoptedStyleSheets`, to which the layout adds its scroll padding sheet. Constructed
 *   sheets are never serialised, so what is added here is simply dropped.
 * - `MutationObserver`, with which the variations runtime and several components watch attributes
 *   and children. Nothing changes during a prerender, so an observer that never fires is truthful.
 * - `validity` on native controls, which form-associated components copy into their own validity.
 *   An untouched control is valid.
 */
export function prepareServerDocument(document: Document): void {
  const view = document.defaultView;
  if (!view) throw new Error("The prerender document has no window");
  if (!Array.isArray(document.adoptedStyleSheets)) {
    Object.defineProperty(document, "adoptedStyleSheets", { value: [], writable: true });
  }
  if (typeof view.MutationObserver !== "function") {
    view.MutationObserver = InertMutationObserver;
  }
  if (!("validity" in view.HTMLElement.prototype)) {
    Object.defineProperty(view.HTMLElement.prototype, "validity", {
      configurable: true,
      get: () => UNTOUCHED_VALIDITY,
    });
  }
}

class InertMutationObserver implements MutationObserver {
  disconnect(): void {
    // Nothing is observed, so there is nothing to stop.
  }

  observe(): void {
    // A prerender changes nothing after the components connect, so there is nothing to report.
  }

  takeRecords(): MutationRecord[] {
    return [];
  }
}

const UNTOUCHED_VALIDITY: ValidityState = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: true,
  valueMissing: false,
};
