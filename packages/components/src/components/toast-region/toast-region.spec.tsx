import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installPopoverElement } from "../../testing/popover-element";
import { removeHost } from "../../testing/remove-host";
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

// The mock document fires no slotchange, so the tests fire it as a browser would.
function slotChanged(region: HTMLElement): void {
  region.shadowRoot?.querySelector("slot")?.dispatchEvent(new Event("slotchange"));
}

function addToast(
  region: HTMLElement,
  heading: string,
  variant = "neutral",
  description?: string,
): ToastHost {
  const toast = document.createElement("idg-toast") as ToastHost;
  toast.heading = heading;
  toast.variant = variant;
  if (description !== undefined) toast.description = description;
  region.append(toast);
  slotChanged(region);
  return toast;
}

function removeToast(region: HTMLElement, toast: ToastHost | undefined): void {
  toast?.remove();
  slotChanged(region);
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
    const { root } = await render(empty);
    const region = part(root, "region");
    expect(region.hasAttribute("data-popover-open")).toBe(false);
    const toast = addToast(root, "Saved");
    expect(region.hasAttribute("data-popover-open")).toBe(true);
    removeToast(root, toast);
    expect(region.hasAttribute("data-popover-open")).toBe(false);
  });
});

describe("idg-toast-region queue", () => {
  it("shows up to max toasts and queues the rest until one goes", async () => {
    const { root } = await render(<idg-toast-region max={2} />);
    for (const heading of ["One", "Two", "Three"]) addToast(root, heading);
    expect(toasts(root).map((toast) => toast.queued)).toEqual([false, false, true]);
    removeToast(root, toasts(root)[0]);
    expect(toasts(root).map((toast) => toast.queued)).toEqual([false, false]);
  });
});

describe("idg-toast-region announcements", () => {
  it("announces a toast politely when it comes into view, as text", async () => {
    const { root } = await render(empty);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    addToast(root, "<b>Saved</b>", "neutral", "Your changes are live.");
    vi.advanceTimersByTime(150);
    const polite = live(root, "polite");
    expect(polite.textContent).toContain("<b>Saved</b>");
    expect(polite.textContent).toContain("Your changes are live.");
    expect(polite.querySelector("b")).toBeNull();
    expect(live(root, "assertive").textContent).toBe("");
  });

  it("announces two toasts that come close together in one announcement", async () => {
    const { root } = await render(empty);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    addToast(root, "First");
    vi.advanceTimersByTime(50);
    addToast(root, "Second");
    vi.advanceTimersByTime(150);
    const polite = live(root, "polite");
    expect(polite.textContent).toContain("First");
    expect(polite.textContent).toContain("Second");
  });

  it("adds to an announcement still showing, rather than replacing it, and clears it later", async () => {
    const { root } = await render(empty);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    addToast(root, "First");
    vi.advanceTimersByTime(100);
    const polite = live(root, "polite");
    const first = polite.firstElementChild;
    expect(first?.textContent).toBe("First");
    vi.advanceTimersByTime(30);
    addToast(root, "Second");
    vi.advanceTimersByTime(100);
    expect(Array.from(polite.children, (line) => line.textContent)).toEqual(["First", "Second"]);
    expect(polite.firstElementChild).toBe(first);
    vi.advanceTimersByTime(5000);
    expect(polite.textContent).toBe("");
  });

  it("announces only a danger toast assertively", async () => {
    const { root } = await render(empty);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    addToast(root, "Upload failed", "danger");
    vi.advanceTimersByTime(150);
    expect(live(root, "assertive").textContent).toContain("Upload failed");
    expect(live(root, "polite").textContent).toBe("");
  });

  it("does not announce a queued toast until it is shown", async () => {
    const { root } = await render(<idg-toast-region max={1} />);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const first = addToast(root, "First");
    addToast(root, "Second");
    vi.advanceTimersByTime(150);
    expect(live(root, "polite").textContent).not.toContain("Second");
    removeToast(root, first);
    vi.advanceTimersByTime(150);
    expect(live(root, "polite").textContent).toContain("Second");
  });
});

describe("idg-toast-region pausing", () => {
  it("pauses every toast while the pointer is over the region", async () => {
    const { root } = await render(empty);
    const toast = addToast(root, "Saved");
    part(root, "region").dispatchEvent(new Event("pointerenter"));
    expect(toast.paused).toBe(true);
    part(root, "region").dispatchEvent(new Event("pointerleave"));
    expect(toast.paused).toBe(false);
  });

  it("pauses every toast while focus is inside the region", async () => {
    const { root } = await render(empty);
    const toast = addToast(root, "Saved");
    toast.dispatchEvent(new Event("focusin", { bubbles: true, composed: true }));
    expect(toast.paused).toBe(true);
    toast.dispatchEvent(new Event("focusout", { bubbles: true, composed: true }));
    expect(toast.paused).toBe(false);
  });

  it("pauses every toast while the window is in the background", async () => {
    const { root } = await render(empty);
    const toast = addToast(root, "Saved");
    window.dispatchEvent(new Event("blur"));
    expect(toast.paused).toBe(true);
    window.dispatchEvent(new Event("focus"));
    expect(toast.paused).toBe(false);
  });

  it("pauses a toast added while paused", async () => {
    const { root } = await render(empty);
    window.dispatchEvent(new Event("blur"));
    const toast = addToast(root, "Saved");
    expect(toast.paused).toBe(true);
    window.dispatchEvent(new Event("focus"));
  });
});

describe("idg-toast-region hotkey", () => {
  it("moves focus to the region on F8 while it holds a toast", async () => {
    const { root } = await render(empty);
    const region = part(root, "region");
    const focus = vi.spyOn(region, "focus");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F8", bubbles: true }));
    expect(focus).not.toHaveBeenCalled();
    addToast(root, "Saved");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F8", bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("takes another hotkey", async () => {
    const { root } = await render(<idg-toast-region hotkey="F6" />);
    addToast(root, "Saved");
    const focus = vi.spyOn(part(root, "region"), "focus");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F8", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F6", bubbles: true }));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(part(root, "region").getAttribute("aria-keyshortcuts")).toBe("F6");
  });
});

describe("idg-toast-region moved", () => {
  it("shows its toasts again after it is moved while showing them", async () => {
    const { root } = await render(<div>{empty}</div>);
    const region = root.querySelector("idg-toast-region") as HTMLElement;
    addToast(region, "Saved");
    removeHost(region);
    // A browser hides a removed popover without a toggle event.
    part(region, "region").removeAttribute("data-popover-open");
    root.append(region);
    slotChanged(region);
    expect(part(region, "region").hasAttribute("data-popover-open")).toBe(true);
  });

  it("announces a toast that was waiting to be announced when it was moved", async () => {
    const { root } = await render(<div>{empty}</div>);
    const region = root.querySelector("idg-toast-region") as HTMLElement;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    addToast(region, "Saved");
    vi.advanceTimersByTime(50);
    removeHost(region);
    root.append(region);
    vi.advanceTimersByTime(100);
    expect(live(region, "polite").textContent).toBe("Saved");
  });

  it("clears an announcement whose time ran out while it was away", async () => {
    const { root } = await render(<div>{empty}</div>);
    const region = root.querySelector("idg-toast-region") as HTMLElement;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    addToast(region, "Saved");
    vi.advanceTimersByTime(100);
    expect(live(region, "polite").textContent).toBe("Saved");
    removeHost(region);
    vi.advanceTimersByTime(6000);
    root.append(region);
    vi.advanceTimersByTime(0);
    expect(live(region, "polite").textContent).toBe("");
  });

  it("keeps following the reduced-motion preference after it is moved", async () => {
    const listeners = new Set<() => void>();
    const query = {
      matches: false,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    const matchMedia = vi.fn(() => query);
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      const { root } = await render(<div>{empty}</div>);
      const region = root.querySelector("idg-toast-region") as HTMLElement;
      const toast = addToast(region, "Saved");
      removeHost(region);
      root.append(region);
      slotChanged(region);
      query.matches = true;
      for (const listener of listeners) listener();
      expect(toast.paused).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
