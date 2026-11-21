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
  installDefaultValidity(prototype);
  const spy = vi.spyOn(prototype, "attachInternals");
  spy.mockImplementation(() => internals);
  try {
    const rendered = await render(vnode);
    return { ...rendered, internals };
  } finally {
    spy.mockRestore();
  }
}

// Left installed for the file: components read validity after every render, not only here.
function installDefaultValidity(prototype: object): void {
  if (Object.prototype.hasOwnProperty.call(prototype, "validity")) return;
  stubValidity(prototype as HTMLElement, {});
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
