import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installPopoverElement } from "../../testing/popover-element";
import "../toast/toast";
import "./toast-region";

interface ToastHost extends HTMLElement {
  heading?: string;
  description?: string;
  variant: string;
  queued: boolean;
  paused: boolean;
}

beforeEach(() => {
  installPopoverElement();
});

afterEach(() => {
  vi.useRealTimers();
});

function part(root: HTMLElement, name: string): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>(`[part="${name}"]`);
  if (!element) throw new Error(`idg-toast-region rendered no ${name}`);
  return element;
}

function live(root: HTMLElement, politeness: "polite" | "assertive"): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>(`[aria-live="${politeness}"]`);
  if (!element) throw new Error(`no ${politeness} live region`);
  return element;
}

function toasts(root: HTMLElement): ToastHost[] {
  return Array.from(root.querySelectorAll<ToastHost>("idg-toast"));
}

function addToast(region: HTMLElement, heading: string, variant = "neutral"): ToastHost {
  const toast = document.createElement("idg-toast") as ToastHost;
  toast.heading = heading;
  toast.variant = variant;
  region.append(toast);
  return toast;
}

const empty = <idg-toast-region />;

describe("idg-toast-region rendering", () => {
  it("is a landmark named for notifications, which the hotkey reaches", async () => {
    const { root } = await render(empty);
    const region = part(root, "region");
    expect(region.localName).toBe("section");
    expect(region.getAttribute("aria-label")).toBe("Notifications");
    expect(region.getAttribute("aria-keyshortcuts")).toBe("F8");
    expect(region.getAttribute("tabindex")).toBe("-1");
    expect(region.querySelector("slot")).not.toBeNull();
  });

  it("sits in the top layer as a manual popover, in the corner it is told", async () => {
    const { root, waitForChanges } = await render(empty);
    expect(part(root, "region").getAttribute("popover")).toBe("manual");
    expect(part(root, "region").classList.contains("position-bottom-end")).toBe(true);
    root.setAttribute("position", "top-center");
    await waitForChanges();
    expect(part(root, "region").classList.contains("position-top-center")).toBe(true);
  });

  it("has one polite and one assertive live region, outside the popover", async () => {
    const { root } = await render(empty);
    const region = part(root, "region");
    for (const politeness of ["polite", "assertive"] as const) {
      const announcer = live(root, politeness);
      expect(announcer.getAttribute("aria-atomic")).toBe("true");
      expect(region.contains(announcer)).toBe(false);
    }
  });

  it("shows the popover only while it holds a toast", async () => {
    const { root, waitForChanges } = await render(empty);
    const region = part(root, "region");
    expect(region.hasAttribute("data-popover-open")).toBe(false);
    const toast = addToast(root, "Saved");
    await waitForChanges();
    expect(region.hasAttribute("data-popover-open")).toBe(true);
    toast.remove();
    await waitForChanges();
    expect(region.hasAttribute("data-popover-open")).toBe(false);
  });
});

describe("idg-toast-region queue", () => {
  it("shows up to max toasts and queues the rest until one goes", async () => {
    const { root, waitForChanges } = await render(<idg-toast-region max={2} />);
    for (const heading of ["One", "Two", "Three"]) addToast(root, heading);
    await waitForChanges();
    expect(toasts(root).map((toast) => toast.queued)).toEqual([false, false, true]);
    toasts(root)[0]?.remove();
    await waitForChanges();
    expect(toasts(root).map((toast) => toast.queued)).toEqual([false, false]);
  });
});

describe("idg-toast-region announcements", () => {
  it("announces a toast politely when it comes into view, as text", async () => {
    const { root, waitForChanges } = await render(empty);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const toast = addToast(root, "<b>Saved</b>");
    toast.description = "Your changes are live.";
    await waitForChanges();
    vi.advanceTimersByTime(150);
    const polite = live(root, "polite");
    expect(polite.textContent).toContain("<b>Saved</b>");
    expect(polite.textContent).toContain("Your changes are live.");
    expect(polite.querySelector("b")).toBeNull();
    expect(live(root, "assertive").textContent).toBe("");
  });

  it("announces only a danger toast assertively", async () => {
    const { root, waitForChanges } = await render(empty);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    addToast(root, "Upload failed", "danger");
    await waitForChanges();
    vi.advanceTimersByTime(150);
    expect(live(root, "assertive").textContent).toContain("Upload failed");
    expect(live(root, "polite").textContent).toBe("");
  });

  it("does not announce a queued toast until it is shown", async () => {
    const { root, waitForChanges } = await render(<idg-toast-region max={1} />);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const first = addToast(root, "First");
    addToast(root, "Second");
    await waitForChanges();
    vi.advanceTimersByTime(150);
    expect(live(root, "polite").textContent).not.toContain("Second");
    first.remove();
    await waitForChanges();
    vi.advanceTimersByTime(150);
    expect(live(root, "polite").textContent).toContain("Second");
  });
});

describe("idg-toast-region pausing", () => {
  it("pauses every toast while the pointer is over the region", async () => {
    const { root, waitForChanges } = await render(empty);
    const toast = addToast(root, "Saved");
    await waitForChanges();
    part(root, "region").dispatchEvent(new Event("pointerenter"));
    await waitForChanges();
    expect(toast.paused).toBe(true);
    part(root, "region").dispatchEvent(new Event("pointerleave"));
    await waitForChanges();
    expect(toast.paused).toBe(false);
  });

  it("pauses every toast while focus is inside the region", async () => {
    const { root, waitForChanges } = await render(empty);
    const toast = addToast(root, "Saved");
    await waitForChanges();
    toast.dispatchEvent(new Event("focusin", { bubbles: true, composed: true }));
    await waitForChanges();
    expect(toast.paused).toBe(true);
    toast.dispatchEvent(new Event("focusout", { bubbles: true, composed: true }));
    await waitForChanges();
    expect(toast.paused).toBe(false);
  });

  it("pauses every toast while the window is in the background", async () => {
    const { root, waitForChanges } = await render(empty);
    const toast = addToast(root, "Saved");
    await waitForChanges();
    window.dispatchEvent(new Event("blur"));
    await waitForChanges();
    expect(toast.paused).toBe(true);
    window.dispatchEvent(new Event("focus"));
    await waitForChanges();
    expect(toast.paused).toBe(false);
  });

  it("pauses a toast added while paused", async () => {
    const { root, waitForChanges } = await render(empty);
    window.dispatchEvent(new Event("blur"));
    await waitForChanges();
    const toast = addToast(root, "Saved");
    await waitForChanges();
    expect(toast.paused).toBe(true);
    window.dispatchEvent(new Event("focus"));
  });
});

describe("idg-toast-region hotkey", () => {
  it("moves focus to the region on F8 while it holds a toast", async () => {
    const { root, waitForChanges } = await render(empty);
    const region = part(root, "region");
    const focus = vi.spyOn(region, "focus");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F8", bubbles: true }));
    expect(focus).not.toHaveBeenCalled();
    addToast(root, "Saved");
    await waitForChanges();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F8", bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("takes another hotkey", async () => {
    const { root, waitForChanges } = await render(<idg-toast-region hotkey="F6" />);
    addToast(root, "Saved");
    await waitForChanges();
    const focus = vi.spyOn(part(root, "region"), "focus");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F8", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F6", bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(part(root, "region").getAttribute("aria-keyshortcuts")).toBe("F6");
  });
});
