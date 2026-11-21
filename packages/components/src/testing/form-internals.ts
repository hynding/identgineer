import { vi } from "vitest";
import { render, type h } from "@stencil/vitest";

export interface FakeInternals {
  form: object | null;
  setFormValue: ReturnType<typeof vi.fn>;
  setValidity: ReturnType<typeof vi.fn>;
  checkValidity: ReturnType<typeof vi.fn>;
  reportValidity: ReturnType<typeof vi.fn>;
  states: Set<string>;
}

export function fakeInternals(form: object | null = null): FakeInternals {
  return {
    form,
    setFormValue: vi.fn(),
    setValidity: vi.fn(),
    checkValidity: vi.fn(() => true),
    reportValidity: vi.fn(() => true),
    states: new Set<string>(),
  };
}

/**
 * Stencil's mock document cannot associate a custom element with a form or keep a validity, so the
 * element internals are replaced by a recorder. Real association is exercised in the browser.
 */
export async function renderWithInternals(vnode: ReturnType<typeof h>, form: object | null = null) {
  const internals = fakeInternals(form);
  const prototype = Object.getPrototypeOf(Object.getPrototypeOf(document.createElement("div"))) as {
    attachInternals: () => unknown;
  };
  const spy = vi.spyOn(prototype, "attachInternals");
  spy.mockImplementation(() => internals);
  try {
    const rendered = await renderControl(vnode);
    return { ...rendered, internals };
  } finally {
    spy.mockRestore();
  }
}

// Left installed for the file: components read validity after every render, not only here.
function installDefaultValidity(prototype: object): void {
  if (Object.prototype.hasOwnProperty.call(prototype, "validity")) return;
  stubValidity(prototype as HTMLElement, {});
  // Only inputs have a value in the mock DOM. A textarea and a select get one as a browser gives
  // them, and any other element reflects it as an attribute, as an option does.
  const values = new WeakMap<object, string>();
  Object.defineProperty(prototype, "value", {
    configurable: true,
    get(this: HTMLElement) {
      return ["TEXTAREA", "SELECT"].includes(this.nodeName)
        ? (values.get(this) ?? "")
        : this.getAttribute("value");
    },
    set(this: HTMLElement, next: string) {
      if (["TEXTAREA", "SELECT"].includes(this.nodeName)) values.set(this, next);
      else this.setAttribute("value", next);
    },
  });
}

/** Renders a form control in the mock DOM, which has no constraint validation of its own. */
export async function renderControl(vnode: ReturnType<typeof h>) {
  installDefaultValidity(
    Object.getPrototypeOf(Object.getPrototypeOf(document.createElement("div"))) as object,
  );
  return render(vnode);
}

/** The mock DOM has no constraint validation, so a native element's validity is supplied. */
export function stubValidity(
  native: HTMLElement,
  flags: Partial<Record<keyof ValidityStateFlags, boolean>>,
  message = "",
): void {
  const all = {
    badInput: false,
    customError: false,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    tooLong: false,
    tooShort: false,
    typeMismatch: false,
    valueMissing: false,
    ...flags,
  };
  Object.defineProperty(native, "validity", {
    value: { ...all, valid: !Object.values(all).some(Boolean) },
    configurable: true,
  });
  Object.defineProperty(native, "validationMessage", { value: message, configurable: true });
}
