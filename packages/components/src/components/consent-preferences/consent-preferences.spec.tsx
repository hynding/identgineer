import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "@stencil/vitest";
import { renderControl as render } from "../../testing/form-internals";
import { createFakeConsent, type FakeConsent } from "../../testing/fake-consent";
import { trackerSetup } from "../../testing/consent-harness";
import { installDialogElement } from "../../testing/dialog-element";
import { button, recordEvents, shadowOf, textOf } from "../../testing/identity-form";
import { languageOf } from "../../consent/language";
import { removeHost } from "../../testing/remove-host";
import "../alert/alert";
import "../button/button";
import "../dialog/dialog";
import "../switch/switch";
import "./consent-preferences";

interface PreferencesElement extends HTMLElement {
  consent?: unknown;
  labels?: Record<string, string>;
  modal?: boolean;
  headingLevel?: number;
  open: () => Promise<boolean>;
  close: () => Promise<void>;
}

async function mount(consent?: unknown, attributes: Partial<PreferencesElement> = {}) {
  const rendered = await render(<idg-consent-preferences />);
  const root = rendered.root as PreferencesElement;
  Object.assign(root, attributes);
  if (consent) root.consent = consent;
  await rendered.waitForChanges();
  return { ...rendered, root };
}

interface SwitchElement extends HTMLElement {
  checked: boolean;
  disabled: boolean;
  accessibleDescription?: string;
}

const analytics = (root: HTMLElement) =>
  shadowOf(root).querySelector<SwitchElement>("idg-switch.analytics");
const necessary = (root: HTMLElement) => shadowOf(root).querySelector("idg-switch.necessary");
const panel = (root: HTMLElement) => shadowOf(root).querySelector(".panel");
const status = (root: HTMLElement) => textOf(root, '[role="status"].status');
const alert = (root: HTMLElement, name: string) =>
  shadowOf(root).querySelector(`idg-alert.${name}`);

/** What the user does to the analytics switch: the switch fires idgChange, as it does for a click. */
async function flip(
  root: HTMLElement,
  checked: boolean,
  waitForChanges: () => Promise<void>,
): Promise<void> {
  const element = analytics(root);
  if (!element) throw new Error("no analytics switch");
  element.checked = checked;
  element.dispatchEvent(
    new CustomEvent("idgChange", {
      detail: { checked, value: "on" },
      bubbles: true,
      composed: true,
    }),
  );
  await waitForChanges();
}

const pressed = (root: HTMLElement, selector: string) => {
  button(root, selector).click();
};

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  installDialogElement();
  events = recordEvents(["idgConsentChange"]);
});

afterEach(() => {
  events.stop();
  for (const child of Array.from(document.body.childNodes)) child.remove();
  vi.restoreAllMocks();
});

describe("idg-consent-preferences without a consent object", () => {
  it("renders nothing and logs nothing", async () => {
    const log = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    const { root } = await mount();
    expect(panel(root)).toBeNull();
    expect(shadowOf(root).textContent).toBe("");
    for (const spy of log) expect(spy).not.toHaveBeenCalled();
  });
});

describe("idg-consent-preferences as a panel", () => {
  it("is a region named by its heading, at the level `headingLevel` says (2 by default)", async () => {
    const { root, waitForChanges } = await mount(createFakeConsent().consent);
    const heading = shadowOf(root).querySelector(".heading");
    expect(heading?.localName).toBe("h2");
    expect(panel(root)?.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(heading?.textContent).toBe("Privacy preferences");
    root.headingLevel = 4;
    await waitForChanges();
    expect(shadowOf(root).querySelector(".heading")?.localName).toBe("h4");
    root.headingLevel = 9;
    await waitForChanges();
    expect(shadowOf(root).querySelector(".heading")?.localName).toBe("h2");
  });

  it("lists Necessary as a plain, always-on row with its explanation: no control to operate", async () => {
    const { root } = await mount(createFakeConsent().consent);
    expect(necessary(root)).toBeNull();
    expect(shadowOf(root).querySelector(".necessary input, .necessary [disabled]")).toBeNull();
    expect(textOf(root, ".necessary-title")).toBe("Necessary");
    expect(textOf(root, ".necessary-state")).toBe("Always on");
    expect(textOf(root, ".necessary-description")).toContain("not tracked");
  });

  it("keeps the Analytics explanation visible to everyone, and gives it to the switch as well", async () => {
    const { root } = await mount(createFakeConsent().consent);
    const description = shadowOf(root).querySelector(".analytics-description");
    expect(description?.getAttribute("aria-hidden")).toBeNull();
    expect(analytics(root)?.accessibleDescription).toContain("Counts page views");
  });

  it.each([
    ["unknown", false],
    ["denied", false],
    ["granted", true],
  ] as const)("shows analytics for %s as %s, never pre-ticked", async (state, checked) => {
    const { root } = await mount(createFakeConsent({ state }).consent);
    expect(analytics(root)?.checked).toBe(checked);
    expect(analytics(root)?.disabled).toBe(false);
    expect(analytics(root)?.textContent).toContain("Analytics");
  });

  it("takes every string from labels", async () => {
    const { root, waitForChanges } = await mount(createFakeConsent().consent);
    root.labels = { title: "Datenschutz", save: "Speichern" };
    await waitForChanges();
    expect(textOf(root, ".heading")).toBe("Datenschutz");
    expect(textOf(root, "idg-button.save")).toBe("Speichern");
    expect(textOf(root, "idg-button.erase")).toBe("Withdraw consent and erase");
  });
});

describe("idg-consent-preferences saving", () => {
  it("changes nothing until Save", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, true, waitForChanges);
    expect(fake.calls.filter((call) => ["grant", "deny", "reset"].includes(call))).toEqual([]);
    expect(events.seen).toEqual([]);
  });

  it("grants on Save when analytics is on, tells the page and confirms politely", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, true, waitForChanges);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(fake.calls.filter((call) => call === "grant")).toHaveLength(1);
    expect(fake.calls).not.toContain("deny");
    expect(events.seen).toEqual([{ type: "idgConsentChange", detail: { state: "granted" } }]);
    expect(status(root)).toBe("Preferences saved. Analytics are on.");
    expect(analytics(root)?.checked).toBe(true);
  });

  it("denies on Save when analytics is off, including when nothing was ever chosen", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(fake.calls.filter((call) => call === "deny")).toHaveLength(1);
    expect(fake.calls).not.toContain("grant");
    expect(events.seen).toEqual([{ type: "idgConsentChange", detail: { state: "denied" } }]);
    expect(status(root)).toBe("Preferences saved. Analytics are off.");
  });

  it("withdraws a grant when the switch is turned off and saved", async () => {
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, false, waitForChanges);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(fake.calls).toContain("deny");
    expect(events.seen).toEqual([{ type: "idgConsentChange", detail: { state: "denied" } }]);
  });

  it("shows an inline error, and keeps the edit, when the choice cannot be stored", async () => {
    const fake = createFakeConsent();
    fake.refuseToStore();
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, true, waitForChanges);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(textOf(root, "idg-alert.error")).toContain("could not be saved");
    expect(analytics(root)?.checked).toBe(true);
    expect(events.seen).toEqual([]);
    expect(status(root)).toBe("");
  });

  it.each(["grant", "deny"] as const)(
    "shows an inline error, not a throw, when %s throws",
    async (method) => {
      const fake = createFakeConsent();
      fake.throwFrom(method);
      const { root, waitForChanges } = await mount(fake.consent);
      await flip(root, method === "grant", waitForChanges);
      expect(() => {
        pressed(root, "idg-button.save");
      }).not.toThrow();
      await waitForChanges();
      expect(alert(root, "error")).not.toBeNull();
    },
  );

  it("clears the error once a later save works", async () => {
    const fake = createFakeConsent();
    fake.throwFrom("deny");
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(alert(root, "error")).not.toBeNull();
    await flip(root, true, waitForChanges);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(alert(root, "error")).toBeNull();
  });
});

describe("idg-consent-preferences under a browser privacy signal", () => {
  it.each([
    ["gpc", "Global Privacy Control"],
    ["dnt", "Do Not Track"],
  ] as const)(
    "has analytics off and disabled, and names the signal, for %s",
    async (reason, name) => {
      const { root } = await mount(createFakeConsent({ state: "denied", reason }).consent);
      expect(analytics(root)?.checked).toBe(false);
      expect(analytics(root)?.disabled).toBe(true);
      expect(textOf(root, "idg-alert.signal")).toContain(name);
      expect(analytics(root)?.accessibleDescription).toContain(name);
    },
  );

  it("cannot grant: a switch forced on is ignored and Save only records a denial", async () => {
    const fake = createFakeConsent({ state: "denied", reason: "gpc" });
    const { root, waitForChanges } = await mount(fake.consent);
    // A disabled switch cannot be flipped by a user, so the event is sent by hand.
    analytics(root)?.dispatchEvent(
      new CustomEvent("idgChange", { detail: { checked: true, value: "on" }, bubbles: true }),
    );
    await waitForChanges();
    expect(analytics(root)?.checked).toBe(false);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(fake.calls).not.toContain("grant");
    expect(fake.calls).toContain("deny");
  });

  it("starts to say so when a signal appears while the panel is open, dropping an edit towards on", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, true, waitForChanges);
    fake.set({ state: "denied", reason: "dnt" });
    await waitForChanges();
    expect(analytics(root)?.checked).toBe(false);
    expect(analytics(root)?.disabled).toBe(true);
    expect(textOf(root, "idg-alert.signal")).toContain("Do Not Track");
  });
});

describe("idg-consent-preferences reflecting changes made elsewhere", () => {
  it("follows a change quietly when there is no unsaved edit", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    fake.set({ state: "granted" });
    await waitForChanges();
    expect(analytics(root)?.checked).toBe(true);
    expect(alert(root, "changed")).toBeNull();
    expect(events.seen).toEqual([]);
  });

  it("says so, and drops the edit, when the stored state changes under an unsaved edit", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, true, waitForChanges);
    fake.set({ state: "denied" });
    await waitForChanges();
    expect(analytics(root)?.checked).toBe(false);
    expect(textOf(root, "idg-alert.changed")).toContain("changed");
    expect(textOf(root, "idg-alert.changed")).toContain("discarded");
    await flip(root, true, waitForChanges);
    await waitForChanges();
    expect(alert(root, "changed")).toBeNull();
  });

  it("sets the switch back even when the change arrives before the render of the user's click", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    const element = analytics(root);
    if (!element) throw new Error("no analytics switch");
    // The click and the other tab's change land in one frame: the render shows only the second.
    element.checked = true;
    element.dispatchEvent(
      new CustomEvent("idgChange", { detail: { checked: true, value: "on" }, bubbles: true }),
    );
    fake.set({ state: "denied" });
    await waitForChanges();
    expect(analytics(root)?.checked).toBe(false);
    expect(textOf(root, "idg-alert.changed")).toContain("discarded");
  });

  it("needs no note when the other change is what the edit asked for", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, true, waitForChanges);
    fake.set({ state: "granted" });
    await waitForChanges();
    expect(analytics(root)?.checked).toBe(true);
    expect(alert(root, "changed")).toBeNull();
  });

  it("keeps an edit when the same state is reported again", async () => {
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, false, waitForChanges);
    fake.set({ state: "granted" });
    await waitForChanges();
    expect(analytics(root)?.checked).toBe(false);
    expect(alert(root, "changed")).toBeNull();
  });

  it("does not announce its own save as a change from elsewhere", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, true, waitForChanges);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(alert(root, "changed")).toBeNull();
    expect(events.seen).toHaveLength(1);
  });
});

describe("idg-consent-preferences and the time of the choice", () => {
  it("shows it, formatted in the document language, from the status the consent object gives", async () => {
    document.documentElement.setAttribute("lang", "de");
    const when = Date.UTC(2026, 2, 1, 12, 30, 0);
    const { root } = await mount(createFakeConsent({ state: "granted", decidedAt: when }).consent);
    const shown = new Intl.DateTimeFormat("de", { dateStyle: "medium", timeStyle: "short" }).format(
      when,
    );
    expect(textOf(root, ".decided")).toBe(`Your choice was made on ${shown}.`);
    document.documentElement.removeAttribute("lang");
  });

  it("shows nothing when there is none", async () => {
    const none = await mount(createFakeConsent({ state: "unknown" }).consent);
    expect(shadowOf(none.root).querySelector(".decided")).toBeNull();
  });

  it("follows the time when a new choice is made", async () => {
    const fake = createFakeConsent({ state: "granted", decidedAt: Date.UTC(2026, 0, 1) });
    const { root, waitForChanges } = await mount(fake.consent);
    fake.set({ state: "denied", decidedAt: Date.UTC(2026, 5, 1) });
    await waitForChanges();
    const shown = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(Date.UTC(2026, 5, 1));
    expect(textOf(root, ".decided")).toContain(shown);
  });

  it("shows the time the real tracker stored", async () => {
    const { tracker } = trackerSetup();
    tracker.consent.grant();
    const { root } = await mount(tracker.consent);
    expect(textOf(root, ".decided")).toContain("Your choice was made on");
  });

  it("uses the language of the nearest element that has one, through shadow hosts, then the document's", () => {
    const outer = document.createElement("div");
    outer.setAttribute("lang", "fr");
    const host = document.createElement("div");
    outer.append(host);
    document.body.append(outer);
    const root = host.attachShadow({ mode: "open" });
    const inner = document.createElement("span");
    root.append(inner);
    expect(languageOf(inner)).toBe("fr");
    inner.setAttribute("lang", "ja");
    expect(languageOf(inner)).toBe("ja");
    outer.remove();
    document.documentElement.setAttribute("lang", "es");
    expect(languageOf(document.createElement("span"))).toBe("es");
    document.documentElement.removeAttribute("lang");
    expect(languageOf(document.createElement("span"))).toBeUndefined();
  });
});

describe("idg-consent-preferences withdrawing and erasing", () => {
  it("asks inline first, never with window.confirm, and changes nothing until it is confirmed", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    expect(shadowOf(root).querySelector(".confirm")).toBeNull();
    pressed(root, "idg-button.erase");
    await waitForChanges();
    expect(textOf(root, ".confirm")).toContain("erase");
    expect(fake.calls).not.toContain("reset");
    expect(confirm).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps the choice when the user backs out", async () => {
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.erase");
    await waitForChanges();
    pressed(root, "idg-button.confirm-no");
    await waitForChanges();
    expect(shadowOf(root).querySelector(".confirm")).toBeNull();
    expect(fake.calls).not.toContain("reset");
    expect(events.seen).toEqual([]);
  });

  it("calls reset() once confirmed, tells the page and says what happened", async () => {
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.erase");
    await waitForChanges();
    pressed(root, "idg-button.confirm-yes");
    await waitForChanges();
    expect(fake.calls.filter((call) => call === "reset")).toHaveLength(1);
    expect(events.seen).toEqual([{ type: "idgConsentChange", detail: { state: "unknown" } }]);
    expect(analytics(root)?.checked).toBe(false);
    expect(shadowOf(root).querySelector(".confirm")).toBeNull();
    expect(status(root)).toContain("erased");
  });

  it.each(["returns false", "throws"])("shows an inline error when reset %s", async (how) => {
    const fake = createFakeConsent({ state: "granted" });
    if (how === "throws") fake.throwFrom("reset");
    else fake.refuseToStore();
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.erase");
    await waitForChanges();
    pressed(root, "idg-button.confirm-yes");
    await waitForChanges();
    expect(textOf(root, "idg-alert.error")).toContain("could not be erased");
    expect(events.seen).toEqual([]);
  });

  it("works with the real tracker: the stored choice is gone", async () => {
    const { tracker, local } = trackerSetup();
    tracker.consent.grant();
    const { root, waitForChanges } = await mount(tracker.consent);
    pressed(root, "idg-button.erase");
    await waitForChanges();
    pressed(root, "idg-button.confirm-yes");
    await waitForChanges();
    expect(tracker.consent.get()).toEqual({ state: "unknown", decidedAt: null });
    expect(local.getItem("idg.tracking.consent.v1")).toBeNull();
  });
});

describe("idg-consent-preferences as a modal", () => {
  const dialog = (root: HTMLElement) =>
    shadowOf(root).querySelector<HTMLElement & { open: boolean; heading?: string }>("idg-dialog");

  it("is drawn inside an idg-dialog, named by its title, closed until open() is called", async () => {
    const { root } = await mount(createFakeConsent().consent, { modal: true });
    expect(dialog(root)?.open).toBe(false);
    expect(dialog(root)?.heading).toBe("Privacy preferences");
    expect(shadowOf(root).querySelector(".heading")).toBeNull();
  });

  it("opens and closes through open() and close()", async () => {
    const { root, waitForChanges } = await mount(createFakeConsent().consent, { modal: true });
    await root.open();
    await waitForChanges();
    expect(dialog(root)?.open).toBe(true);
    await root.close();
    await waitForChanges();
    expect(dialog(root)?.open).toBe(false);
  });

  it("follows the dialog's own close, and drops an unsaved edit, so it opens as stored", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent, { modal: true });
    await root.open();
    await waitForChanges();
    await flip(root, true, waitForChanges);
    dialog(root)?.dispatchEvent(
      new CustomEvent("idgClose", { detail: { returnValue: "", reason: "escape" } }),
    );
    await waitForChanges();
    expect(dialog(root)?.open).toBe(false);
    expect(analytics(root)?.checked).toBe(false);
    expect(fake.calls).not.toContain("grant");
  });

  it("closes after a successful save, and stays open when the save failed", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent, { modal: true });
    await root.open();
    await waitForChanges();
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(dialog(root)?.open).toBe(false);
    const refusing = createFakeConsent();
    refusing.refuseToStore();
    root.consent = refusing.consent;
    await root.open();
    await waitForChanges();
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(dialog(root)?.open).toBe(true);
    expect(alert(root, "error")).not.toBeNull();
  });
});

describe("idg-consent-preferences as an inline panel's open()", () => {
  it("moves focus to the panel's heading, and close() does nothing", async () => {
    const { root } = await mount(createFakeConsent().consent);
    const heading = shadowOf(root).querySelector<HTMLElement>(".heading");
    if (!heading) throw new Error("no heading");
    const focus = vi.spyOn(heading, "focus");
    await root.open();
    expect(focus).toHaveBeenCalledTimes(1);
    await expect(root.close()).resolves.toBeUndefined();
    expect(panel(root)).not.toBeNull();
  });
});

describe("idg-consent-preferences and the consent object it is given", () => {
  const listeners = (fake: FakeConsent) => fake.listenerCount();

  it("unsubscribes on disconnect, subscribes again on reconnect, and survives a move", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    expect(listeners(fake)).toBe(1);
    const parent = root.parentElement;
    removeHost(root);
    expect(listeners(fake)).toBe(0);
    parent?.append(root);
    await waitForChanges();
    expect(listeners(fake)).toBe(1);
    const elsewhere = document.createElement("div");
    document.body.append(elsewhere);
    elsewhere.append(root);
    await waitForChanges();
    expect(listeners(fake)).toBe(1);
  });

  it("follows a swapped object and starts again from its state, dropping any edit", async () => {
    const first = createFakeConsent();
    const second = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(first.consent);
    await flip(root, true, waitForChanges);
    root.consent = second.consent;
    await waitForChanges();
    expect(listeners(first)).toBe(0);
    expect(listeners(second)).toBe(1);
    expect(analytics(root)?.checked).toBe(true);
    expect(alert(root, "changed")).toBeNull();
    root.consent = undefined;
    await waitForChanges();
    expect(panel(root)).toBeNull();
  });

  it("says it cannot read the state, instead of throwing, when get() throws", async () => {
    const fake = createFakeConsent();
    fake.throwFrom("get");
    const { root } = await mount(fake.consent);
    expect(textOf(root, "idg-alert.error")).toContain("not available");
    expect(analytics(root)).toBeNull();
  });
});

describe("idg-consent-preferences with the real tracker", () => {
  it("saves a grant that the tracker then honours", async () => {
    const { tracker, collector } = trackerSetup();
    const { root, waitForChanges } = await mount(tracker.consent);
    await flip(root, true, waitForChanges);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(tracker.consent.get()).toMatchObject({ state: "granted" });
    tracker.track("clicked");
    await tracker.flush();
    expect(collector.requests.length).toBeGreaterThan(0);
  });

  it("under GPC names the signal, cannot grant, and sends nothing", async () => {
    const { tracker, collector } = trackerSetup({ gpc: true });
    const { root, waitForChanges } = await mount(tracker.consent);
    expect(analytics(root)?.disabled).toBe(true);
    expect(textOf(root, "idg-alert.signal")).toContain("Global Privacy Control");
    await flip(root, true, waitForChanges);
    pressed(root, "idg-button.save");
    await waitForChanges();
    tracker.track("clicked");
    await tracker.flush();
    expect(tracker.consent.get()).toMatchObject({ state: "denied", reason: "gpc" });
    expect(collector.requests).toEqual([]);
  });

  it("follows the banner's choice made through the same tracker", async () => {
    const { tracker } = trackerSetup();
    const { root, waitForChanges } = await mount(tracker.consent);
    tracker.consent.grant();
    await waitForChanges();
    expect(analytics(root)?.checked).toBe(true);
  });
});

describe("idg-consent-preferences and repeated presses", () => {
  it("saves once for a double press of Save", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent);
    await flip(root, true, waitForChanges);
    pressed(root, "idg-button.save");
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(fake.calls.filter((call) => call === "grant")).toHaveLength(1);
    expect(events.seen).toHaveLength(1);
  });

  it("erases once for a double press of the confirmation, and can save again after", async () => {
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.erase");
    await waitForChanges();
    pressed(root, "idg-button.confirm-yes");
    pressed(root, "idg-button.confirm-yes");
    await waitForChanges();
    expect(fake.calls.filter((call) => call === "reset")).toHaveLength(1);
    expect(events.seen).toHaveLength(1);
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(fake.calls).toContain("deny");
  });

  it("lets a failed save be tried again", async () => {
    const fake = createFakeConsent();
    fake.refuseToStore();
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.save");
    await waitForChanges();
    pressed(root, "idg-button.save");
    await waitForChanges();
    expect(fake.calls.filter((call) => call === "deny")).toHaveLength(2);
  });
});

describe("idg-consent-preferences open() without a consent object", () => {
  it("does nothing, says false, and does not open later when the object arrives", async () => {
    const { root, waitForChanges } = await mount(undefined, { modal: true });
    expect(await root.open()).toBe(false);
    root.consent = createFakeConsent().consent;
    await waitForChanges();
    expect(shadowOf(root).querySelector<HTMLElement & { open: boolean }>("idg-dialog")?.open).toBe(
      false,
    );
  });

  it("says true when it opens", async () => {
    const { root } = await mount(createFakeConsent().consent, { modal: true });
    expect(await root.open()).toBe(true);
  });
});

describe("idg-consent-preferences closing without saving", () => {
  const dismiss = async (root: HTMLElement, waitForChanges: () => Promise<void>) => {
    shadowOf(root)
      .querySelector("idg-dialog")
      ?.dispatchEvent(
        new CustomEvent("idgClose", { detail: { returnValue: "", reason: "escape" } }),
      );
    await waitForChanges();
  };

  it("says politely that the changes were not saved when an edit is dropped", async () => {
    const fake = createFakeConsent();
    const { root, waitForChanges } = await mount(fake.consent, { modal: true });
    await root.open();
    await waitForChanges();
    await flip(root, true, waitForChanges);
    await dismiss(root, waitForChanges);
    expect(status(root)).toContain("not saved");
  });

  it("says nothing when there was no edit", async () => {
    const { root, waitForChanges } = await mount(createFakeConsent().consent, { modal: true });
    await root.open();
    await waitForChanges();
    await dismiss(root, waitForChanges);
    expect(status(root)).toBe("");
  });

  it("says nothing after a save closed it", async () => {
    const { root, waitForChanges } = await mount(createFakeConsent().consent, { modal: true });
    await root.open();
    await waitForChanges();
    await flip(root, true, waitForChanges);
    pressed(root, "idg-button.save");
    await waitForChanges();
    await dismiss(root, waitForChanges);
    expect(status(root)).not.toContain("not saved");
  });
});

describe("idg-consent-preferences when the choice changes under an open confirmation", () => {
  it("dismisses the confirmation and says so in the live region", async () => {
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    pressed(root, "idg-button.erase");
    await waitForChanges();
    fake.set({ state: "denied" });
    await waitForChanges();
    expect(shadowOf(root).querySelector(".confirm")).toBeNull();
    expect(status(root)).toContain("changed elsewhere");
  });

  it("says nothing of a confirmation that was not showing", async () => {
    const fake = createFakeConsent({ state: "granted" });
    const { root, waitForChanges } = await mount(fake.consent);
    fake.set({ state: "denied" });
    await waitForChanges();
    expect(status(root)).toBe("");
  });
});
