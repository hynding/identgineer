import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import {
  applyVariations,
  getVariations,
  REGISTRY,
  resetVariations,
  STORAGE_KEY,
  variationsUrl,
} from "@identgineer/variations";
import { removeHost } from "../../testing/remove-host";
import "./variation-switcher";
import type { VariationsChangeDetail } from "./variation-switcher-types";

const unsubscribes = vi.hoisted(() => ({ calls: 0, subscriptions: 0 }));

vi.mock("@identgineer/variations", async (importOriginal) => {
  const original = await importOriginal<typeof import("@identgineer/variations")>();
  return {
    ...original,
    onVariationsChange: (...args: Parameters<typeof original.onVariationsChange>) => {
      unsubscribes.subscriptions += 1;
      const stop = original.onVariationsChange(...args);
      return () => {
        unsubscribes.calls += 1;
        stop();
      };
    },
  };
});

type Control = "theme" | "design" | "layout" | "ux" | "scheme";

function shadow(root: HTMLElement): ShadowRoot {
  if (!root.shadowRoot) throw new Error("idg-variation-switcher rendered no shadow root");
  return root.shadowRoot;
}

function field(root: HTMLElement, control: Control): HTMLElement {
  const element = shadow(root).querySelector<HTMLElement>(`idg-field[data-control="${control}"]`);
  if (!element) throw new Error(`no ${control} control`);
  return element;
}

function inner(root: HTMLElement, control: Control): HTMLElement {
  const element = field(root, control).firstElementChild;
  if (!element) throw new Error(`the ${control} field holds no control`);
  return element as HTMLElement;
}

function choose(root: HTMLElement, control: Control, value: string): void {
  inner(root, control).dispatchEvent(
    new CustomEvent("idgChange", { detail: { value }, bubbles: true, composed: true }),
  );
}

function action(root: HTMLElement, name: "shuffle" | "reset" | "copy"): void {
  const button = shadow(root).querySelector<HTMLElement>(`[data-action="${name}"]`);
  if (!button) throw new Error(`no ${name} action`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function status(root: HTMLElement): string {
  return shadow(root).querySelector('[role="status"]')?.textContent.trim() ?? "";
}

class FakeStorage {
  readonly entries = new Map<string, string>();
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

let storage: FakeStorage;

// The mock window has no MutationObserver, which the runtime uses to hear changes made by markup.
// Changes made through the runtime itself reach listeners without it; the observer is exercised in
// the browser tests.
class IdleObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  takeRecords(): [] {
    return [];
  }
}

beforeEach(() => {
  Object.defineProperty(window, "MutationObserver", { configurable: true, value: IdleObserver });
  resetVariations();
  storage = new FakeStorage();
  vi.stubGlobal("localStorage", storage);
  unsubscribes.calls = 0;
  unsubscribes.subscriptions = 0;
});

afterEach(() => {
  Reflect.deleteProperty(window, "MutationObserver");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetVariations();
});

describe("idg-variation-switcher rendering", () => {
  it("is a group with a default accessible name", async () => {
    const { root } = await render(<idg-variation-switcher />);
    const group = shadow(root).querySelector('[role="group"]');
    expect(group?.getAttribute("aria-label")).toBe("Appearance");
    expect(group?.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("is named by the heading when one is given", async () => {
    const { root } = await render(<idg-variation-switcher heading="Make it yours" />);
    const group = shadow(root).querySelector('[role="group"]');
    const id = group?.getAttribute("aria-labelledby") ?? "";
    expect(id).not.toBe("");
    expect(shadow(root).getElementById(id)?.textContent).toBe("Make it yours");
    expect(group?.hasAttribute("aria-label")).toBe(false);
  });

  it("draws five labelled controls", async () => {
    const { root } = await render(<idg-variation-switcher />);
    const fields = Array.from(shadow(root).querySelectorAll("idg-field"));
    expect(fields.map((element) => element.getAttribute("data-control"))).toEqual([
      "theme",
      "design",
      "layout",
      "ux",
      "scheme",
    ]);
    expect(fields.map((element) => element.getAttribute("label"))).toEqual([
      "Theme",
      "Design",
      "Layout",
      "UX",
      "Scheme",
    ]);
  });

  it.each(["design", "layout", "ux"] as const)(
    "offers every %s of the registry, by label, in registry order",
    async (axis) => {
      const { root } = await render(<idg-variation-switcher />);
      const select = inner(root, axis);
      expect(select.tagName).toBe("IDG-SELECT");
      const options = Array.from(select.querySelectorAll("option"));
      expect(options.map((option) => option.getAttribute("value"))).toEqual(
        REGISTRY[axis].variations.map((variation) => variation.id),
      );
      expect(options.map((option) => option.textContent)).toEqual(
        REGISTRY[axis].variations.map((variation) => variation.label),
      );
      expect(options).toHaveLength(8);
    },
  );

  it("offers every theme as a radio with a swatch, and the three schemes", async () => {
    const { root } = await render(<idg-variation-switcher />);
    const themes = Array.from(inner(root, "theme").querySelectorAll("idg-radio"));
    expect(themes.map((radio) => radio.getAttribute("value"))).toEqual(
      REGISTRY.theme.variations.map((variation) => variation.id),
    );
    expect(themes).toHaveLength(8);
    for (const radio of themes) expect(radio.querySelector("svg")).not.toBeNull();
    const schemes = Array.from(inner(root, "scheme").querySelectorAll("idg-radio"));
    expect(schemes.map((radio) => radio.getAttribute("value"))).toEqual([
      "system",
      "light",
      "dark",
    ]);
  });

  it("draws the swatches from the registry colours of both schemes, as fill attributes only", async () => {
    const { root } = await render(<idg-variation-switcher />);
    const aurora = REGISTRY.theme.variations[0];
    const swatch = inner(root, "theme").querySelector("idg-radio svg");
    const fills = Array.from(swatch?.querySelectorAll("[fill]") ?? []).map((node) =>
      node.getAttribute("fill"),
    );
    if (aurora?.preview.kind !== "theme") throw new Error("the first theme has no swatches");
    for (const scheme of ["light", "dark"] as const) {
      expect(fills).toContain(aurora.preview.swatches[scheme].bg);
      expect(fills).toContain(aurora.preview.swatches[scheme].accent);
    }
    for (const fill of fills) expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
    expect(swatch?.getAttribute("aria-hidden")).toBe("true");
  });

  it("never writes an inline style anywhere in its tree", async () => {
    const { root } = await render(<idg-variation-switcher heading="x" />);
    expect(shadow(root).querySelectorAll("[style]")).toHaveLength(0);
  });

  it("shows the state the page is in", async () => {
    applyVariations({
      theme: "ember",
      design: "glass",
      layout: "bento",
      ux: "focus",
      scheme: "dark",
    });
    const { root } = await render(<idg-variation-switcher />);
    expect(inner(root, "theme").getAttribute("value")).toBe("ember");
    expect(inner(root, "design").getAttribute("value")).toBe("glass");
    expect(inner(root, "layout").getAttribute("value")).toBe("bento");
    expect(inner(root, "ux").getAttribute("value")).toBe("focus");
    expect(inner(root, "scheme").getAttribute("value")).toBe("dark");
  });

  it("describes the chosen option as the hint of its control", async () => {
    applyVariations({ design: "glass" });
    const { root } = await render(<idg-variation-switcher />);
    const glass = REGISTRY.design.variations.find((variation) => variation.id === "glass");
    expect(field(root, "design").getAttribute("hint")).toBe(glass?.description);
  });

  it("has a polite live region for results", async () => {
    const { root } = await render(<idg-variation-switcher />);
    const live = shadow(root).querySelector('[role="status"]');
    expect(live?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("idg-variation-switcher props", () => {
  it("shows only the controls named in axes, ignoring unknown names", async () => {
    const { root } = await render(<idg-variation-switcher axes="scheme,nope,theme" />);
    expect(
      Array.from(shadow(root).querySelectorAll("idg-field")).map((element) =>
        element.getAttribute("data-control"),
      ),
    ).toEqual(["theme", "scheme"]);
  });

  it("follows a change of axes", async () => {
    const { root, waitForChanges } = await render(<idg-variation-switcher axes="theme" />);
    (root as unknown as { axes: string }).axes = "ux,layout";
    await waitForChanges();
    expect(
      Array.from(shadow(root).querySelectorAll("idg-field")).map((element) =>
        element.getAttribute("data-control"),
      ),
    ).toEqual(["layout", "ux"]);
  });

  it("is stacked unless told otherwise, and falls back for an unknown orientation", async () => {
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    expect(shadow(root).querySelector(".panel")?.classList.contains("orientation-stacked")).toBe(
      true,
    );
    (root as unknown as { orientation: string }).orientation = "inline";
    await waitForChanges();
    expect(shadow(root).querySelector(".panel")?.classList.contains("orientation-inline")).toBe(
      true,
    );
    (root as unknown as { orientation: string }).orientation = "diagonal";
    await waitForChanges();
    expect(shadow(root).querySelector(".panel")?.classList.contains("orientation-stacked")).toBe(
      true,
    );
  });
});

describe("idg-variation-switcher controls", () => {
  it.each([
    ["theme", "ember", "data-theme"],
    ["design", "glass", "data-design"],
    ["layout", "bento", "data-layout"],
    ["ux", "focus", "data-ux"],
    ["scheme", "dark", "data-scheme"],
  ] as const)("choosing %s %s sets %s and nothing else", async (control, value, attribute) => {
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    const before = getVariations();
    choose(root, control, value);
    await waitForChanges();
    expect(document.documentElement.getAttribute(attribute)).toBe(value);
    expect(getVariations()).toEqual({ ...before, [control]: value });
  });

  it("announces the change in the live region", async () => {
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    choose(root, "theme", "ember");
    await waitForChanges();
    expect(status(root)).toBe("Theme: Ember.");
  });

  it("refuses a value outside the registry", async () => {
    const { root, waitForChanges, spyOnEvent } = await render(<idg-variation-switcher />);
    const spy = spyOnEvent("idgVariationsChange");
    choose(root, "theme", "not-a-theme");
    await waitForChanges();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(spy.length).toBe(0);
  });

  it("stops the inner control's idgChange from leaving the panel", async () => {
    const { root, waitForChanges, spyOnEvent } = await render(<idg-variation-switcher />);
    const spy = spyOnEvent("idgChange");
    choose(root, "design", "glass");
    await waitForChanges();
    expect(spy.length).toBe(0);
  });

  it("emits idgVariationsChange with the new state and what changed", async () => {
    const { root, waitForChanges, spyOnEvent } = await render(<idg-variation-switcher />);
    const spy = spyOnEvent("idgVariationsChange");
    choose(root, "design", "glass");
    await waitForChanges();
    expect(spy.length).toBe(1);
    expect(spy.lastEvent?.detail).toEqual({
      state: { ...getVariations(), design: "glass" },
      changed: ["design"],
    });
  });

  it("emits nothing when the choice is the one already made", async () => {
    applyVariations({ design: "glass" });
    const { root, waitForChanges, spyOnEvent } = await render(<idg-variation-switcher />);
    const spy = spyOnEvent("idgVariationsChange");
    choose(root, "design", "glass");
    await waitForChanges();
    expect(spy.length).toBe(0);
  });
});

describe("idg-variation-switcher actions", () => {
  it("Surprise me applies a shuffled state from the injected random source", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const { root, waitForChanges, spyOnEvent } = await render(<idg-variation-switcher />);
    const spy = spyOnEvent("idgVariationsChange");
    action(root, "shuffle");
    await waitForChanges();
    const last = (axis: "theme" | "design" | "layout" | "ux") =>
      REGISTRY[axis].variations.at(-1)?.id;
    expect(getVariations()).toEqual({
      theme: last("theme"),
      design: last("design"),
      layout: last("layout"),
      ux: last("ux"),
      scheme: "system",
    });
    expect(spy.length).toBe(1);
    expect((spy.lastEvent?.detail as VariationsChangeDetail).changed).toEqual([
      "theme",
      "design",
      "layout",
      "ux",
    ]);
    expect(status(root)).toMatch(/^Shuffled\. Theme: .+ Design: .+ Layout: .+ UX: .+\.$/);
  });

  it("Surprise me keeps the scheme", async () => {
    applyVariations({ scheme: "dark" });
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    action(root, "shuffle");
    await waitForChanges();
    expect(getVariations().scheme).toBe("dark");
  });

  it("Reset returns every axis to its default and says so", async () => {
    applyVariations({
      theme: "ember",
      design: "glass",
      layout: "bento",
      ux: "focus",
      scheme: "dark",
    });
    const { root, waitForChanges, spyOnEvent } = await render(<idg-variation-switcher />);
    const spy = spyOnEvent("idgVariationsChange");
    action(root, "reset");
    await waitForChanges();
    expect(getVariations()).toEqual({
      theme: "aurora",
      design: "flat",
      layout: "top-bar",
      ux: "comfortable",
      scheme: "system",
    });
    expect((spy.lastEvent?.detail as VariationsChangeDetail).changed).toEqual([
      "theme",
      "design",
      "layout",
      "ux",
      "scheme",
    ]);
    expect(status(root)).toBe("Reset to the defaults.");
    expect(inner(root, "theme").getAttribute("value")).toBe("aurora");
  });

  it("Reset on a page already at the defaults emits no event", async () => {
    const { root, waitForChanges, spyOnEvent } = await render(<idg-variation-switcher />);
    const spy = spyOnEvent("idgVariationsChange");
    action(root, "reset");
    await waitForChanges();
    expect(spy.length).toBe(0);
  });
});

describe("idg-variation-switcher persistence", () => {
  it("does not touch storage by default", async () => {
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    choose(root, "theme", "ember");
    action(root, "shuffle");
    action(root, "reset");
    await waitForChanges();
    expect(storage.entries.size).toBe(0);
  });

  it("saves each change when persist is set", async () => {
    const { root, waitForChanges } = await render(<idg-variation-switcher persist />);
    choose(root, "theme", "ember");
    await waitForChanges();
    expect(JSON.parse(storage.entries.get(STORAGE_KEY) ?? "{}")).toEqual({ theme: "ember" });
    choose(root, "scheme", "dark");
    await waitForChanges();
    expect(JSON.parse(storage.entries.get(STORAGE_KEY) ?? "{}")).toEqual({
      theme: "ember",
      scheme: "dark",
    });
  });

  it("saves a shuffle and clears the saved choice on reset when persist is set", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { root, waitForChanges } = await render(<idg-variation-switcher persist />);
    action(root, "shuffle");
    await waitForChanges();
    expect(Object.keys(JSON.parse(storage.entries.get(STORAGE_KEY) ?? "{}") as object)).toEqual(
      expect.arrayContaining(["theme", "design", "layout", "ux"]),
    );
    action(root, "reset");
    await waitForChanges();
    expect(storage.entries.has(STORAGE_KEY)).toBe(false);
  });
});

describe("idg-variation-switcher copy link", () => {
  function stubClipboard(writeText: unknown): void {
    vi.stubGlobal("navigator", { clipboard: writeText === undefined ? undefined : { writeText } });
  }

  it("writes the share link for the current state and says it was copied", async () => {
    applyVariations({ theme: "ember", scheme: "dark" });
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    action(root, "copy");
    await waitForChanges();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(variationsUrl(getVariations(), location.href));
    expect(status(root)).toBe("Link copied.");
    expect(shadow(root).querySelector(".fallback")).toBeNull();
  });

  it.each([
    ["is denied", () => vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError")))],
    [
      "throws at once",
      () =>
        vi.fn(() => {
          throw new Error("no");
        }),
    ],
    ["is missing", () => undefined],
  ])("when the clipboard %s, offers the link to copy by hand", async (_name, make) => {
    stubClipboard(make());
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    action(root, "copy");
    await waitForChanges();
    await waitForChanges();
    expect(status(root)).toBe(
      "The link could not be copied. Select it below and copy it yourself.",
    );
    const fallback = shadow(root).querySelector<HTMLElement>(".fallback idg-input");
    expect(fallback?.getAttribute("value")).toBe(variationsUrl(getVariations(), location.href));
    expect(fallback?.hasAttribute("readonly")).toBe(true);
  });

  it("never uses execCommand", async () => {
    const execCommand = vi.fn();
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    stubClipboard(undefined);
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    action(root, "copy");
    await waitForChanges();
    expect(execCommand).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("hides the manual link again after the next successful copy", async () => {
    stubClipboard(undefined);
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    action(root, "copy");
    await waitForChanges();
    expect(shadow(root).querySelector(".fallback")).not.toBeNull();
    stubClipboard(vi.fn(() => Promise.resolve()));
    action(root, "copy");
    await waitForChanges();
    await waitForChanges();
    expect(shadow(root).querySelector(".fallback")).toBeNull();
  });
});

describe("idg-variation-switcher staying in sync", () => {
  it("shows a change made outside, without emitting an event of its own", async () => {
    const { root, waitForChanges, spyOnEvent } = await render(<idg-variation-switcher />);
    const spy = spyOnEvent("idgVariationsChange");
    applyVariations({ theme: "ember", ux: "focus" });
    await waitForChanges();
    expect(inner(root, "theme").getAttribute("value")).toBe("ember");
    expect(inner(root, "ux").getAttribute("value")).toBe("focus");
    expect(spy.length).toBe(0);
  });

  it("keeps two switchers in step, and only the one used emits", async () => {
    const first = await render(<idg-variation-switcher />);
    const second = await render(<idg-variation-switcher />);
    const firstSpy = first.spyOnEvent("idgVariationsChange");
    const secondSpy = second.spyOnEvent("idgVariationsChange");
    choose(first.root, "design", "glass");
    await first.waitForChanges();
    await second.waitForChanges();
    expect(inner(second.root, "design").getAttribute("value")).toBe("glass");
    expect(firstSpy.length).toBe(1);
    expect(secondSpy.length).toBe(0);
  });

  it("subscribes once on connect and unsubscribes on disconnect", async () => {
    const { root } = await render(<idg-variation-switcher />);
    expect(unsubscribes.subscriptions).toBe(1);
    const stopped = unsubscribes.calls;
    removeHost(root);
    expect(unsubscribes.calls).toBe(stopped + 1);
  });

  it("reads the page again when it is connected again", async () => {
    const { root, waitForChanges } = await render(<idg-variation-switcher />);
    const parent = root.parentElement;
    removeHost(root);
    applyVariations({ theme: "ember" });
    parent?.appendChild(root);
    await waitForChanges();
    expect(unsubscribes.subscriptions).toBe(2);
    expect(inner(root, "theme").getAttribute("value")).toBe("ember");
  });
});
