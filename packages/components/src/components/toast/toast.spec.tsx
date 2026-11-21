import { afterEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import "./toast";

interface ToastHost extends HTMLElement {
  queued: boolean;
  paused: boolean;
  dismiss: () => Promise<void>;
}

afterEach(() => {
  vi.useRealTimers();
});

interface ToastProps {
  heading: string;
  duration?: number;
  actionLabel?: string;
  queued?: boolean;
}

// Fake timers are installed once an empty page has rendered, which needs real ones; the toasts are
// added afterwards, so their countdowns run on fake time.
async function mountTimed(...props: ToastProps[]): Promise<ToastHost[]> {
  const { root } = await render(<div />);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  return props.map((values) => {
    const toast = Object.assign(document.createElement("idg-toast"), values) as ToastHost;
    root.append(toast);
    return toast;
  });
}

async function mountOneTimed(props: ToastProps): Promise<ToastHost> {
  const [toast] = await mountTimed(props);
  if (toast === undefined) throw new Error("no toast was mounted");
  return toast;
}

function part(root: HTMLElement, name: string): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>(`[part="${name}"]`);
  if (!element) throw new Error(`idg-toast rendered no ${name}`);
  return element;
}

function toastIn(root: HTMLElement): ToastHost {
  const element = root.localName === "idg-toast" ? root : root.querySelector("idg-toast");
  if (!element) throw new Error("no idg-toast");
  return element as ToastHost;
}

function reasons(root: HTMLElement): string[] {
  const seen: string[] = [];
  root.addEventListener("idgDismiss", (event) => {
    seen.push((event as CustomEvent<{ reason: string }>).detail.reason);
  });
  return seen;
}

function pointer(target: HTMLElement, type: string, clientX: number): void {
  const event = new Event(type, { bubbles: true }) as Event & {
    clientX: number;
    clientY: number;
    pointerId: number;
    pointerType: string;
  };
  event.clientX = clientX;
  event.clientY = 0;
  event.pointerId = 1;
  event.pointerType = "touch";
  target.dispatchEvent(event);
}

const saved = <idg-toast heading="Saved" description="Your changes are live." />;

describe("idg-toast rendering", () => {
  it("draws the heading and the description as text, never as markup", async () => {
    const { root } = await render(
      <idg-toast heading="<b>Saved</b>" description="<img src=x onerror=alert(1)>" />,
    );
    expect(part(root, "heading").textContent).toBe("<b>Saved</b>");
    expect(part(root, "heading").querySelector("b")).toBeNull();
    expect(part(root, "description").textContent).toBe("<img src=x onerror=alert(1)>");
    expect(root.shadowRoot?.querySelector("img")).toBeNull();
  });

  it("is a group named by its heading", async () => {
    const { root } = await render(saved);
    const toast = part(root, "toast");
    expect(toast.getAttribute("role")).toBe("group");
    const id = toast.getAttribute("aria-labelledby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.textContent).toBe("Saved");
  });

  it("leaves out the description when there is none", async () => {
    const { root } = await render(<idg-toast heading="Saved" />);
    expect(root.shadowRoot?.querySelector('[part="description"]')).toBeNull();
  });

  it("gives each status variant an icon and its tone", async () => {
    const { root, waitForChanges } = await render(saved);
    expect(root.shadowRoot?.querySelector('[part="icon"]')).toBeNull();
    root.setAttribute("variant", "danger");
    await waitForChanges();
    expect(part(root, "icon").getAttribute("name")).toBe("error");
    expect(part(root, "toast").classList.contains("variant-danger")).toBe(true);
  });

  it("has a close button with an accessible name", async () => {
    const { root } = await render(saved);
    const close = part(root, "close");
    expect(close.localName).toBe("button");
    expect(close.getAttribute("aria-label")).toBe("Dismiss");
  });

  it("draws an action button only with an action label", async () => {
    const { root, waitForChanges } = await render(saved);
    expect(root.shadowRoot?.querySelector('[part="action"]')).toBeNull();
    root.setAttribute("action-label", "Undo");
    await waitForChanges();
    expect(part(root, "action").textContent).toBe("Undo");
  });
});

describe("idg-toast dismissal", () => {
  it("is dismissed by the close button, and removes itself", async () => {
    const { root } = await render(<div>{saved}</div>);
    const toast = toastIn(root);
    const seen = reasons(toast);
    part(toast, "close").click();
    expect(seen).toEqual(["close-button"]);
    await Promise.resolve();
    expect(toast.isConnected).toBe(false);
  });

  it("stays when a listener prevents the dismissal", async () => {
    const { root } = await render(<div>{saved}</div>);
    const toast = toastIn(root);
    toast.addEventListener("idgDismiss", (event) => {
      event.preventDefault();
    });
    part(toast, "close").click();
    await Promise.resolve();
    expect(toast.isConnected).toBe(true);
  });

  it("fires idgAction and is dismissed when its action is chosen", async () => {
    const { root } = await render(<div>{<idg-toast heading="Deleted" actionLabel="Undo" />}</div>);
    const toast = toastIn(root);
    const action = vi.fn();
    toast.addEventListener("idgAction", action);
    const seen = reasons(toast);
    part(toast, "action").click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["action"]);
  });

  it("is dismissed by Escape from inside it", async () => {
    const { root } = await render(<div>{saved}</div>);
    const toast = toastIn(root);
    const seen = reasons(toast);
    part(toast, "close").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(seen).toEqual(["escape"]);
  });

  it("is dismissed by its dismiss method", async () => {
    const { root } = await render(<div>{saved}</div>);
    const toast = toastIn(root);
    const seen = reasons(toast);
    await toast.dismiss();
    expect(seen).toEqual(["api"]);
    await Promise.resolve();
    expect(toast.isConnected).toBe(false);
  });

  it("is dismissed by a sideways swipe, and springs back from a short one", async () => {
    const { root } = await render(<div>{saved}</div>);
    const toast = toastIn(root);
    const seen = reasons(toast);
    const surface = part(toast, "toast");
    pointer(surface, "pointerdown", 200);
    pointer(surface, "pointermove", 180);
    pointer(surface, "pointerup", 180);
    expect(seen).toEqual([]);
    expect(surface.style.getPropertyValue("--_swipe")).toBe("");
    pointer(surface, "pointerdown", 200);
    pointer(surface, "pointermove", 300);
    pointer(surface, "pointerup", 300);
    expect(seen).toEqual(["swipe"]);
  });
});

describe("idg-toast timing", () => {
  it("dismisses itself after its duration", async () => {
    const toast = await mountOneTimed({ heading: "Saved", duration: 3000 });
    const seen = reasons(toast);
    vi.advanceTimersByTime(2999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["timeout"]);
  });

  it("dismisses itself after a default duration when none is given", async () => {
    const toast = await mountOneTimed({ heading: "Saved" });
    const seen = reasons(toast);
    vi.advanceTimersByTime(5999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["timeout"]);
  });

  it("never dismisses itself while it offers an action, unless given a duration", async () => {
    const [kept, timed] = await mountTimed(
      { heading: "Deleted", actionLabel: "Undo" },
      { heading: "Deleted", actionLabel: "Undo", duration: 8000 },
    );
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(kept?.isConnected).toBe(true);
    expect(timed?.isConnected).toBe(false);
  });

  it("stays until dismissed with a duration of 0", async () => {
    const toast = await mountOneTimed({ heading: "Saved", duration: 0 });
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(toast.isConnected).toBe(true);
  });

  it("does not count down while queued, and gets its whole duration once shown", async () => {
    const toast = await mountOneTimed({ heading: "Saved", duration: 1000, queued: true });
    const seen = reasons(toast);
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([]);
    toast.queued = false;
    vi.advanceTimersByTime(999);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(["timeout"]);
  });

  it("stands still while paused and runs on with the time left", async () => {
    const toast = await mountOneTimed({ heading: "Saved", duration: 1000 });
    const host = toast;
    const seen = reasons(host);
    vi.advanceTimersByTime(600);
    host.paused = true;
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual([]);
    host.paused = false;
    vi.advanceTimersByTime(400);
    expect(seen).toEqual(["timeout"]);
  });

  it("stops counting once removed", async () => {
    const toast = await mountOneTimed({ heading: "Saved", duration: 1000 });
    const host = toast;
    const seen = reasons(host);
    host.remove();
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([]);
  });
});
