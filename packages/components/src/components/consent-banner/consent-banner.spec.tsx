import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { createFakeConsent, type FakeConsent } from "../../testing/fake-consent";
import { trackerSetup } from "../../testing/consent-harness";
import { button, recordEvents, shadowOf, textOf } from "../../testing/identity-form";
import { removeHost } from "../../testing/remove-host";
import "../alert/alert";
import "../button/button";
import "./consent-banner";

interface BannerElement extends HTMLElement {
  consent?: unknown;
  labels?: Record<string, string>;
  placement?: string;
  announceSignal?: boolean;
  preferences?: string;
}

async function mount(
  consent?: unknown,
  attributes: Partial<BannerElement> = {},
  children?: unknown,
) {
  const rendered = await render(<idg-consent-banner>{children}</idg-consent-banner>);
  const root = rendered.root as BannerElement;
  Object.assign(root, attributes);
  if (consent) root.consent = consent;
  await rendered.waitForChanges();
  return { ...rendered, root };
}

const banner = (root: HTMLElement) => shadowOf(root).querySelector(".banner");
const status = (root: HTMLElement) => textOf(root, '[role="status"].status');
const pressed = (root: HTMLElement, selector: string) => {
  button(root, selector).click();
};

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  events = recordEvents(["idgConsentChange", "idgConsentChoose"]);
});

afterEach(() => {
  events.stop();
  for (const child of Array.from(document.body.childNodes)) child.remove();
  vi.restoreAllMocks();
});

describe("idg-consent-banner without a consent object", () => {
  it("renders nothing and logs nothing", async () => {
    const log = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    const { root } = await mount();
    expect(banner(root)).toBeNull();
    expect(shadowOf(root).textContent).toBe("");
    for (const spy of log) expect(spy).not.toHaveBeenCalled();
  });

  it("ignores a value that is not a consent object", async () => {
    const { root } = await mount({ get: () => ({ state: "unknown" }) });
    expect(banner(root)).toBeNull();
  });
});

describe("idg-consent-banner asking", () => {
  it("is a non-modal region with an accessible name, never a dialog", async () => {
    const { root } = await mount(createFakeConsent().consent);
    const region = banner(root);
    expect(region?.getAttribute("role")).toBe("region");
    expect(region?.getAttribute("aria-label")).toBe("Analytics choice");
    expect(shadowOf(root).querySelector("dialog, [aria-modal], [role=dialog]")).toBeNull();
    expect(region?.getAttribute("tabindex")).toBeNull();
  });

  it("offers Decline, Accept analytics and Choose, in that order, and nothing pre-ticked", async () => {
    const { root } = await mount(createFakeConsent().consent);
    const order = Array.from(shadowOf(root).querySelectorAll("idg-button")).map((element) =>
      element.textContent.trim(),
    );
    expect(order).toEqual(["Decline", "Accept analytics", "Choose"]);
    expect(shadowOf(root).querySelectorAll("input, idg-checkbox, idg-switch")).toHaveLength(0);
  });

  it("gives Accept and Decline the same variant and size, and has no close control", async () => {
    const { root } = await mount(createFakeConsent().consent);
    const decline = button(root, "idg-button.decline") as unknown as Record<string, string> &
      HTMLElement;
    const accept = button(root, "idg-button.accept") as unknown as Record<string, string> &
      HTMLElement;
    expect(decline.variant).toBe(accept.variant);
    expect(decline.size).toBe(accept.size);
    expect(decline.hasAttribute("full-width")).toBe(accept.hasAttribute("full-width"));
    expect(shadowOf(root).querySelector('[part="close"], .close, [aria-label="Close"]')).toBeNull();
  });

  it("has slots for the message and the policy link, with default words", async () => {
    const { root } = await mount(createFakeConsent().consent);
    expect(shadowOf(root).querySelector('slot[name="message"]')).not.toBeNull();
    expect(shadowOf(root).querySelector('slot[name="policy"]')).not.toBeNull();
    expect(textOf(root, ".message")).toContain("Nothing is sent unless you accept");
  });

  it("takes every string from labels, a partial object merged over the English defaults", async () => {
    const { root, waitForChanges } = await mount(createFakeConsent().consent);
    root.labels = { accept: "Analyse zulassen", decline: "Ablehnen", regionName: "Analyse" };
    await waitForChanges();
    expect(banner(root)?.getAttribute("aria-label")).toBe("Analyse");
    expect(textOf(root, "idg-button.accept")).toBe("Analyse zulassen");
    expect(textOf(root, "idg-button.decline")).toBe("Ablehnen");
    expect(textOf(root, "idg-button.choose")).toBe("Choose");
  });

  it("places the bar by `placement`, and falls back to the bottom for anything else", async () => {
    const { root, waitForChanges } = await mount(createFakeConsent().consent);
    expect(banner(root)?.classList.contains("placement-bottom")).toBe(true);
    for (const placement of ["top", "inline", "bottom"]) {
      root.placement = placement;
      await waitForChanges();
      expect(banner(root)?.classList.contains(`placement-${placement}`)).toBe(true);
    }
    root.placement = "middle";
    await waitForChanges();
    expect(banner(root)?.classList.contains("placement-bottom")).toBe(true);
  });

  it("is not shown once a choice is stored, either one", async () => {
    for (const state of ["granted", "denied"] as const) {
      const { root } = await mount(createFakeConsent({ state }).consent);
      expect(banner(root)).toBeNull();
    }
  });

  it("does not react to Escape: ignoring the banner is no consent", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    banner(root)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await waitForChanges();
    expect(fake.calls.filter((call) => call !== "get" && call !== "onChange")).toEqual([]);
    expect(banner(root)).not.toBeNull();
    expect(events.seen).toEqual([]);
  });

  it("asks again when the choice is withdrawn elsewhere", async () => {
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    fake.set({ state: "unknown" });
    await waitForChanges();
    expect(banner(root)).not.toBeNull();
    expect(events.seen).toEqual([]);
  });
});

describe("idg-consent-banner choices", () => {
  it.each([
    ["Accept analytics", "accept", "granted", "grant", "deny"],
    ["Decline", "decline", "denied", "deny", "grant"],
  ] as const)(
    "%s records the choice, tells the page once and confirms it politely",
    async (_label, name, state, called, other) => {
      const fake = createFakeConsent();
      const { root, waitForChanges } = await mount(fake.consent);
      pressed(root, `idg-button.${name}`);
      await waitForChanges();
      expect(fake.calls.filter((call) => call === called)).toHaveLength(1);
      expect(fake.calls).not.toContain(other);
      expect(events.seen).toEqual([{ type: "idgConsentChange", detail: { state } }]);
      expect(banner(root)).toBeNull();
      expect(status(root)).toBe(
        state === "granted" ? "Analytics accepted." : "Analytics declined.",
      );
    },
  );

  it("says so, and keeps asking, when the choice cannot be stored", async () => {
    const fake = createFakeConsent();
    fake.refuseToStore();
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.accept");
    await waitForChanges();
    expect(banner(root)).not.toBeNull();
    expect(textOf(root, "idg-alert.error")).toContain("could not be saved");
    expect(events.seen).toEqual([]);
    expect(status(root)).toBe("");
  });

  it("moves focus back to what had it before the banner, once a choice is made", async () => {
    const before = document.createElement("button");
    document.body.append(before);
    const focus = vi.spyOn(before, "focus");
    const { root, waitForChanges } = await mount(createFakeConsent().consent);
    const entered = new Event("focusin", { bubbles: true, composed: true });
    Object.assign(entered, { relatedTarget: before });
    button(root, "idg-button.decline").dispatchEvent(entered);
    pressed(root, "idg-button.decline");
    await waitForChanges();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("falls back to the main landmark when that element is gone", async () => {
    const main = document.createElement("main");
    document.body.append(main);
    const focus = vi.spyOn(main, "focus").mockImplementation(() => undefined);
    const { root, waitForChanges } = await mount(createFakeConsent().consent);
    pressed(root, "idg-button.accept");
    await waitForChanges();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("takes no focus when it appears, and says nothing of a choice made somewhere else", async () => {
    const before = document.createElement("button");
    const main = document.createElement("main");
    document.body.append(before, main);
    const focuses = [vi.spyOn(before, "focus"), vi.spyOn(main, "focus")];
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    fake.set({ state: "granted" });
    await waitForChanges();
    for (const spy of focuses) expect(spy).not.toHaveBeenCalled();
    expect(banner(root)).toBeNull();
    expect(events.seen).toEqual([]);
    expect(status(root)).toBe("");
  });
});

describe("idg-consent-banner and the preferences", () => {
  // The render helper starts from an empty page, so the panel goes in after the banner.
  function panelNamed(id: string) {
    const panel = document.createElement("div");
    panel.id = id;
    const open = vi.fn();
    Object.assign(panel, { open });
    document.body.append(panel);
    return open;
  }

  it("Choose tells the page, and opens the preferences the `preferences` id names", async () => {
    const { root } = await mount(createFakeConsent().consent, { preferences: "prefs" });
    const open = panelNamed("prefs");
    pressed(root, "idg-button.choose");
    expect(events.seen).toEqual([{ type: "idgConsentChoose", detail: undefined }]);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens a slotted preferences panel, drawing its slot only then if it is not modal", async () => {
    const { root, waitForChanges } = await mount(
      createFakeConsent().consent,
      {},
      <div slot="preferences" />,
    );
    const open = vi.fn();
    Object.assign(root.querySelector('[slot="preferences"]') ?? {}, { open, modal: false });
    expect(shadowOf(root).querySelector('slot[name="preferences"]')).toBeNull();
    pressed(root, "idg-button.choose");
    await waitForChanges();
    expect(shadowOf(root).querySelector('slot[name="preferences"]')).not.toBeNull();
    expect(
      (button(root, "idg-button.choose") as unknown as Record<string, unknown>).accessibleExpanded,
    ).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("draws the slot of a modal preferences panel at once, and opens it", async () => {
    const { root } = await mount(createFakeConsent().consent, {}, <div slot="preferences" />);
    const open = vi.fn();
    Object.assign(root.querySelector('[slot="preferences"]') ?? {}, { open, modal: true });
    pressed(root, "idg-button.choose");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("leaves the preferences closed when a listener cancels idgConsentChoose", async () => {
    const { root } = await mount(createFakeConsent().consent, { preferences: "prefs" });
    const open = panelNamed("prefs");
    const stop = (event: Event) => {
      event.preventDefault();
    };
    document.addEventListener("idgConsentChoose", stop);
    pressed(root, "idg-button.choose");
    document.removeEventListener("idgConsentChoose", stop);
    expect(open).not.toHaveBeenCalled();
  });

  it("does nothing more than emit when no preferences are named or slotted", async () => {
    const { root } = await mount(createFakeConsent().consent, { preferences: "missing" });
    expect(() => {
      pressed(root, "idg-button.choose");
    }).not.toThrow();
    expect(events.seen).toHaveLength(1);
  });
});

describe("idg-consent-banner under a browser privacy signal", () => {
  it.each(["gpc", "dnt"] as const)("does not ask under %s, and renders nothing", async (reason) => {
    const fake = createFakeConsent({ state: "denied", reason });
    const { root } = await mount(fake.consent);
    expect(banner(root)).toBeNull();
    expect(shadowOf(root).querySelector("idg-button")).toBeNull();
    expect(shadowOf(root).querySelector(".signal-note")).toBeNull();
    expect(fake.calls.filter((call) => call === "grant" || call === "deny")).toEqual([]);
  });

  it.each([
    ["gpc", "Global Privacy Control"],
    ["dnt", "Do Not Track"],
  ] as const)(
    "with announce-signal says in one polite line that %s is respected and analytics are off",
    async (reason, name) => {
      const { root } = await mount(createFakeConsent({ state: "denied", reason }).consent, {
        announceSignal: true,
      });
      const note = shadowOf(root).querySelector(".signal-note");
      expect(note?.getAttribute("role")).toBe("status");
      expect(textOf(root, ".signal-note")).toContain(name);
      expect(textOf(root, ".signal-note")).toContain("analytics are off");
      expect(shadowOf(root).querySelector("idg-button")).toBeNull();
    },
  );

  it("stops asking when a signal appears, and asks again if it goes while nothing was chosen", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    fake.set({ state: "denied", reason: "gpc" });
    await waitForChanges();
    expect(banner(root)).toBeNull();
    fake.set({ state: "unknown" });
    await waitForChanges();
    expect(banner(root)).not.toBeNull();
  });
});

describe("idg-consent-banner when the consent object fails", () => {
  it.each(["grant", "deny"] as const)("shows an inline error when %s throws", async (method) => {
    const fake = createFakeConsent();
    fake.throwFrom(method);
    const { root, waitForChanges } = await mount(fake.consent);
    expect(() => {
      pressed(root, method === "grant" ? "idg-button.accept" : "idg-button.decline");
    }).not.toThrow();
    await waitForChanges();
    expect(textOf(root, "idg-alert.error")).toContain("could not be saved");
    expect(banner(root)).not.toBeNull();
    expect(events.seen).toEqual([]);
  });

  it("clears the error when the next try works", async () => {
    const fake = createFakeConsent();
    fake.refuseToStore();
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.decline");
    await waitForChanges();
    expect(shadowOf(root).querySelector("idg-alert.error")).not.toBeNull();
    const working = createFakeConsent();
    root.consent = working.consent;
    await waitForChanges();
    expect(shadowOf(root).querySelector("idg-alert.error")).toBeNull();
  });

  it("says the choice is unavailable when the state cannot be read, instead of throwing", async () => {
    const fake = createFakeConsent();
    fake.throwFrom("get");
    const { root } = await mount(fake.consent);
    expect(textOf(root, "idg-alert.error")).toContain("not available");
    expect(shadowOf(root).querySelector("idg-button")).toBeNull();
  });
});

describe("idg-consent-banner and the consent object it is given", () => {
  const listeners = (fake: FakeConsent) => fake.listenerCount();

  it("unsubscribes when it leaves the page and subscribes again when it comes back", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    expect(listeners(fake)).toBe(1);
    const parent = root.parentElement;
    removeHost(root);
    expect(listeners(fake)).toBe(0);
    parent?.append(root);
    await waitForChanges();
    expect(listeners(fake)).toBe(1);
    fake.set({ state: "granted" });
    await waitForChanges();
    expect(banner(root)).toBeNull();
  });

  it("moves in the DOM without a second subscription or a repeated event", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    const elsewhere = document.createElement("div");
    document.body.append(elsewhere);
    elsewhere.append(root);
    await waitForChanges();
    expect(listeners(fake)).toBe(1);
    pressed(root, "idg-button.accept");
    await waitForChanges();
    expect(events.seen).toHaveLength(1);
  });

  it("follows a swapped object, lets the old one go, and goes quiet when it is taken away", async () => {
    const first = createFakeConsent();
    const second = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(first.consent);
    root.consent = second.consent;
    await waitForChanges();
    expect(listeners(first)).toBe(0);
    expect(listeners(second)).toBe(1);
    expect(banner(root)).toBeNull();
    root.consent = undefined;
    await waitForChanges();
    expect(listeners(second)).toBe(0);
    expect(shadowOf(root).textContent).toBe("");
  });

  it("is told of a change in the object it was handed after it was connected", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount();
    root.consent = fake.consent;
    await waitForChanges();
    expect(banner(root)).not.toBeNull();
  });
});

describe("idg-consent-banner with the real tracker", () => {
  it("Accept grants, and the tracker then reports granted", async () => {
    const { tracker, local } = trackerSetup();
    const { root, waitForChanges } = await mount(tracker.consent);
    pressed(root, "idg-button.accept");
    await waitForChanges();
    expect(tracker.consent.get()).toMatchObject({ state: "granted" });
    expect(local.getItem("idg.tracking.consent.v1")).toContain('"granted"');
    expect(banner(root)).toBeNull();
    expect(events.seen).toEqual([{ type: "idgConsentChange", detail: { state: "granted" } }]);
  });

  it("Decline denies and sends nothing, even with events tracked afterwards", async () => {
    const { tracker, collector } = trackerSetup();
    const { root, waitForChanges } = await mount(tracker.consent);
    pressed(root, "idg-button.decline");
    await waitForChanges();
    tracker.track("clicked");
    await tracker.flush();
    expect(tracker.consent.get()).toMatchObject({ state: "denied" });
    expect(collector.requests).toEqual([]);
  });

  it("sends nothing while it is asking", async () => {
    const { tracker, collector } = trackerSetup();
    await mount(tracker.consent);
    tracker.track("clicked");
    tracker.page();
    await tracker.flush();
    expect(collector.requests).toEqual([]);
  });

  it.each([
    [{ gpc: true }, "Global Privacy Control"],
    [{ dnt: "1" }, "Do Not Track"],
  ] as const)(
    "does not ask under a browser signal %j, and says so when asked to",
    async (signal, name) => {
      const { tracker } = trackerSetup(signal);
      const quiet = await mount(tracker.consent);
      expect(banner(quiet.root)).toBeNull();
      const loud = await mount(tracker.consent, { announceSignal: true });
      expect(textOf(loud.root, ".signal-note")).toContain(name);
      expect(tracker.consent.get().state).toBe("denied");
    },
  );

  it("asks again after the choice is reset", async () => {
    const { tracker } = trackerSetup();
    tracker.consent.grant();
    const { root, waitForChanges } = await mount(tracker.consent);
    expect(banner(root)).toBeNull();
    tracker.consent.reset();
    await waitForChanges();
    expect(banner(root)).not.toBeNull();
  });
});

describe("idg-consent-banner and repeated presses", () => {
  it.each(["accept", "decline"] as const)(
    "chooses once, tells the page once and announces once for a double press of %s",
    async (name) => {
      const fake = createFakeConsent();
      const { root } = await mount(fake.consent);
      pressed(root, `idg-button.${name}`);
      pressed(root, `idg-button.${name}`);
      pressed(root, `idg-button.${name === "accept" ? "decline" : "accept"}`);
      expect(fake.calls.filter((call) => call === "grant" || call === "deny")).toHaveLength(1);
      expect(events.seen).toHaveLength(1);
    },
  );

  it("does not choose when the state has already been decided elsewhere", async () => {
    const fake = createFakeConsent();
    const { root } = await mount(fake.consent);
    fake.setQuietly({ state: "denied" });
    pressed(root, "idg-button.accept");
    expect(fake.calls).not.toContain("grant");
    expect(events.seen).toEqual([]);
  });

  it("still lets a refused choice be tried again", async () => {
    const fake = createFakeConsent();
    fake.refuseToStore();
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.accept");
    await waitForChanges();
    pressed(root, "idg-button.accept");
    expect(fake.calls.filter((call) => call === "grant")).toHaveLength(2);
  });
});

describe("idg-consent-banner and the page's scroll padding", () => {
  const padding = (side: "end" | "start") =>
    document.documentElement.style.getPropertyValue(`scroll-padding-block-${side}`);

  it("reserves nothing for a bar at the top, which scrolls away with the page", async () => {
    await mount(createFakeConsent().consent, { placement: "top" });
    expect(padding("start")).toBe("");
    expect(padding("end")).toBe("");
  });

  it("reserves nothing for an inline bar, and gives the bottom bar's space back when it goes", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent, { placement: "inline" });
    expect(padding("end")).toBe("");
    root.placement = "bottom";
    await waitForChanges();
    root.placement = "inline";
    await waitForChanges();
    expect(padding("end")).toBe("");
  });
});
