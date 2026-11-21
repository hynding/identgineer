import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installPopoverElement } from "../../testing/popover-element";
import "../button/button";
import "./tooltip";

type DescribedTrigger = HTMLElement & { accessibleDescription?: string };

let popover: ReturnType<typeof installPopoverElement>;

beforeEach(() => {
  popover = installPopoverElement();
});

afterEach(() => {
  vi.useRealTimers();
});

function surface(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="tooltip"]');
  if (!element) throw new Error("idg-tooltip rendered no tooltip");
  return element;
}

function trigger(root: HTMLElement): DescribedTrigger {
  const element = root.querySelector<DescribedTrigger>("button, idg-button");
  if (!element) throw new Error("no trigger");
  return element;
}

function pointer(target: HTMLElement, type: string, pointerType = "mouse"): void {
  const event = new Event(type) as Event & { pointerType: string };
  event.pointerType = pointerType;
  target.dispatchEvent(event);
}

// Fake timers are installed only once the component has rendered, which needs real ones.
async function renderTimed(vnode: ReturnType<typeof h>) {
  const rendered = await render(vnode);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  return rendered;
}

const isShown = (root: HTMLElement) => surface(root).hasAttribute("data-popover-open");

const native = (
  <idg-tooltip text="Copies the link">
    <button>Copy</button>
  </idg-tooltip>
);

describe("idg-tooltip rendering", () => {
  it("draws the text as text, in a hint popover hidden from assistive technology", async () => {
    const { root } = await render(
      <idg-tooltip text="<b>bold</b>">
        <button>Copy</button>
      </idg-tooltip>,
    );
    const element = surface(root);
    expect(element.textContent).toBe("<b>bold</b>");
    expect(element.querySelector("b")).toBeNull();
    expect(["hint", "manual"]).toContain(element.getAttribute("popover"));
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.querySelector("slot")).toBeNull();
  });

  it("places the tooltip on top by default", async () => {
    const { root } = await render(native);
    expect(surface(root).classList.contains("placement-top")).toBe(true);
  });
});

describe("idg-tooltip description", () => {
  it("describes a native trigger with aria-description", async () => {
    const { root } = await render(native);
    expect(trigger(root).ariaDescription).toBe("Copies the link");
  });

  it("hands the description to an idg-* trigger through its property", async () => {
    const { root } = await render(
      <idg-tooltip text="Copies the link">
        <idg-button>Copy</idg-button>
      </idg-tooltip>,
    );
    expect(trigger(root).accessibleDescription).toBe("Copies the link");
  });

  it("follows a change of the text", async () => {
    const { root, waitForChanges } = await render(native);
    root.setAttribute("text", "Copied");
    await waitForChanges();
    expect(trigger(root).ariaDescription).toBe("Copied");
  });

  it("takes the description away when it is removed", async () => {
    const { root } = await render(
      <div>
        <idg-tooltip text="Tip">
          <button>Copy</button>
        </idg-tooltip>
      </div>,
    );
    const button = trigger(root);
    root.querySelector("idg-tooltip")?.remove();
    expect(button.ariaDescription).toBeNull();
  });
});

describe("idg-tooltip showing and hiding", () => {
  it("shows after the hover delay, not before", async () => {
    const { root } = await renderTimed(native);
    pointer(trigger(root), "pointerenter");
    vi.advanceTimersByTime(450);
    expect(isShown(root)).toBe(false);
    vi.advanceTimersByTime(100);
    expect(isShown(root)).toBe(true);
  });

  it("does not show for a pointer that leaves before the delay", async () => {
    const { root } = await renderTimed(native);
    pointer(trigger(root), "pointerenter");
    vi.advanceTimersByTime(200);
    pointer(trigger(root), "pointerleave");
    vi.advanceTimersByTime(1000);
    expect(popover.showPopover).not.toHaveBeenCalled();
  });

  it("ignores touch, so a long press does not cover the control", async () => {
    const { root } = await renderTimed(native);
    pointer(trigger(root), "pointerenter", "touch");
    vi.advanceTimersByTime(2000);
    expect(isShown(root)).toBe(false);
  });

  it("shows at once on keyboard focus and hides on blur", async () => {
    const { root } = await renderTimed(native);
    trigger(root).dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(isShown(root)).toBe(true);
    trigger(root).dispatchEvent(new Event("focusout", { bubbles: true }));
    expect(isShown(root)).toBe(false);
  });

  it("stays while the pointer moves from the trigger onto the tooltip", async () => {
    const { root } = await renderTimed(native);
    pointer(trigger(root), "pointerenter");
    vi.advanceTimersByTime(500);
    pointer(trigger(root), "pointerleave");
    vi.advanceTimersByTime(50);
    pointer(surface(root), "pointerenter");
    vi.advanceTimersByTime(1000);
    expect(isShown(root)).toBe(true);
    pointer(surface(root), "pointerleave");
    vi.advanceTimersByTime(1000);
    expect(isShown(root)).toBe(false);
  });

  it("hides on Escape, taking the key so nothing else closes", async () => {
    const { root } = await renderTimed(native);
    trigger(root).dispatchEvent(new Event("focusin", { bubbles: true }));
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(isShown(root)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves Escape alone while hidden", async () => {
    await renderTimed(native);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("hides when the page scrolls", async () => {
    const { root } = await renderTimed(native);
    trigger(root).dispatchEvent(new Event("focusin", { bubbles: true }));
    window.dispatchEvent(new Event("scroll"));
    expect(isShown(root)).toBe(false);
  });

  it("shows nothing without text", async () => {
    const { root } = await renderTimed(
      <idg-tooltip>
        <button>Copy</button>
      </idg-tooltip>,
    );
    trigger(root).dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(isShown(root)).toBe(false);
  });
});
