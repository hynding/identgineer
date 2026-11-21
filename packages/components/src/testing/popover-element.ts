import { vi } from "vitest";

interface FakePopover extends HTMLElement {
  showPopover: (options?: { source?: HTMLElement }) => void;
  hidePopover: () => void;
}

function toggle(element: HTMLElement, newState: "open" | "closed"): void {
  const event = new Event("toggle") as Event & { newState: string; oldState: string };
  event.newState = newState;
  event.oldState = newState === "open" ? "closed" : "open";
  element.dispatchEvent(event);
}

/**
 * Stencil's mock document has no Popover API, so the element prototype is given `showPopover` and
 * `hidePopover`, which flip a marker attribute and fire `toggle` with its `newState` as a browser
 * does. The top layer, light dismiss and positioning are real-browser behaviour, tested there.
 */
export function installPopoverElement(): {
  showPopover: ReturnType<typeof vi.fn>;
  hidePopover: ReturnType<typeof vi.fn>;
} {
  const prototype = Object.getPrototypeOf(
    Object.getPrototypeOf(document.createElement("div")),
  ) as FakePopover;
  const showPopover = vi.fn(function (this: FakePopover) {
    if (this.hasAttribute("data-popover-open")) return;
    this.setAttribute("data-popover-open", "");
    toggle(this, "open");
  });
  const hidePopover = vi.fn(function (this: FakePopover) {
    if (!this.hasAttribute("data-popover-open")) return;
    this.removeAttribute("data-popover-open");
    toggle(this, "closed");
  });
  Object.defineProperties(prototype, {
    showPopover: { configurable: true, writable: true, value: showPopover },
    hidePopover: { configurable: true, writable: true, value: hidePopover },
  });
  return { showPopover, hidePopover };
}
