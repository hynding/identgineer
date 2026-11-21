import { vi } from "vitest";

interface FakeDialog extends HTMLElement {
  open: boolean;
  returnValue: string;
  showModal: () => void;
  show: () => void;
  close: (returnValue?: string) => void;
}

/**
 * Stencil's mock document has no dialog behaviour, so the prototype of its dialog element is given
 * the small part of `HTMLDialogElement` the component drives: opening, closing with a return value,
 * and the `close` event queued after closing, as a browser queues it. Focus, the top layer, inertness
 * and Escape are real-browser behaviour and are tested there.
 */
export function installDialogElement(): {
  showModal: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
} {
  const prototype = Object.getPrototypeOf(document.createElement("dialog")) as FakeDialog;
  const showModal = vi.fn(function (this: FakeDialog) {
    this.setAttribute("open", "");
  });
  const show = vi.fn(function (this: FakeDialog) {
    this.setAttribute("open", "");
  });
  Object.defineProperties(prototype, {
    open: {
      configurable: true,
      get(this: FakeDialog) {
        return this.hasAttribute("open");
      },
    },
    returnValue: { configurable: true, writable: true, value: "" },
    showModal: { configurable: true, writable: true, value: showModal },
    show: { configurable: true, writable: true, value: show },
    close: {
      configurable: true,
      writable: true,
      value(this: FakeDialog, returnValue?: string) {
        if (!this.hasAttribute("open")) return;
        if (returnValue !== undefined) this.returnValue = returnValue;
        this.removeAttribute("open");
        setTimeout(() => this.dispatchEvent(new Event("close")));
      },
    },
  });
  return { showModal, show };
}
