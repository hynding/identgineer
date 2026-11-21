import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installAriaReflection } from "../../testing/aria-reflection";
import { stubMutationObserver } from "../../testing/mutation-observer";
import { removeHost } from "../../testing/remove-host";
import "../tab/tab";
import "../tab-panel/tab-panel";
import "./tabs";

interface TabElement extends HTMLElement {
  value: string;
  disabled: boolean;
  selected: boolean;
  tabbable: boolean;
  orientation: string;
  ariaControlsElements: Element[] | null;
}

interface PanelElement extends HTMLElement {
  selected: boolean;
  ariaLabelledByElements: Element[] | null;
}

interface TabsElement extends HTMLElement {
  value: string;
  orientation: string;
}

beforeEach(() => {
  installAriaReflection();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const basic = (
  <idg-tabs label="Project">
    <idg-tab value="overview">Overview</idg-tab>
    <idg-tab value="activity">Activity</idg-tab>
    <idg-tab value="settings" disabled>
      Settings
    </idg-tab>
    <idg-tab value="billing">Billing</idg-tab>
    <idg-tab-panel value="overview">Overview body</idg-tab-panel>
    <idg-tab-panel value="activity">Activity body</idg-tab-panel>
    <idg-tab-panel value="settings">Settings body</idg-tab-panel>
    <idg-tab-panel value="billing">Billing body</idg-tab-panel>
  </idg-tabs>
);

const tabs = (root: HTMLElement) => Array.from(root.querySelectorAll<TabElement>("idg-tab"));
const panels = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<PanelElement>("idg-tab-panel"));
const valueOf = (root: HTMLElement) => (root as TabsElement).value;

function within(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

function tabAt(root: HTMLElement, index: number): TabElement {
  const found = tabs(root)[index];
  if (!found) throw new Error(`no tab ${String(index)}`);
  return found;
}

function press(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

function spyFocus(root: HTMLElement) {
  return tabs(root).map((tab) => vi.spyOn(tab, "focus").mockImplementation(() => undefined));
}

function slotchange(root: HTMLElement): void {
  root.shadowRoot?.querySelector("slot:not([name])")?.dispatchEvent(new Event("slotchange"));
  root.shadowRoot?.querySelector('slot[name="tab"]')?.dispatchEvent(new Event("slotchange"));
}

describe("idg-tabs rendering", () => {
  it("draws a tab list named by its label, with a slot for the tabs and one for the panels", async () => {
    const { root } = await render(basic);
    const list = root.shadowRoot?.querySelector('[role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("Project");
    expect(list?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(list?.querySelector('slot[name="tab"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector("slot:not([name])")).not.toBeNull();
  });

  it("tells a vertical list so", async () => {
    const { root } = await render(
      <idg-tabs orientation="vertical">
        <idg-tab value="a">A</idg-tab>
        <idg-tab-panel value="a">A</idg-tab-panel>
      </idg-tabs>,
    );
    expect(
      root.shadowRoot?.querySelector('[role="tablist"]')?.getAttribute("aria-orientation"),
    ).toBe("vertical");
    expect(tabAt(root, 0).orientation).toBe("vertical");
  });

  it("puts every tab in the tab list slot without being asked", async () => {
    const { root } = await render(basic);
    expect(tabs(root).map((tab) => tab.getAttribute("slot"))).toEqual(["tab", "tab", "tab", "tab"]);
    expect(panels(root).some((panel) => panel.hasAttribute("slot"))).toBe(false);
  });
});

describe("idg-tabs selection state", () => {
  it("selects the first enabled tab and shows only its panel", async () => {
    const { root } = await render(basic);
    expect(valueOf(root)).toBe("overview");
    expect(tabs(root).map((tab) => tab.selected)).toEqual([true, false, false, false]);
    expect(panels(root).map((panel) => panel.selected)).toEqual([true, false, false, false]);
  });

  it("selects the tab whose value it is given", async () => {
    const { root } = await render(
      <idg-tabs value="billing">
        <idg-tab value="overview">Overview</idg-tab>
        <idg-tab value="billing">Billing</idg-tab>
        <idg-tab-panel value="overview">O</idg-tab-panel>
        <idg-tab-panel value="billing">B</idg-tab-panel>
      </idg-tabs>,
    );
    expect(tabs(root).map((tab) => tab.selected)).toEqual([false, true]);
    expect(panels(root).map((panel) => panel.selected)).toEqual([false, true]);
  });

  it("falls back to the first enabled tab for a value that matches none, or a disabled one", async () => {
    for (const value of ["nothing", "settings"]) {
      const { root } = await render(
        <idg-tabs value={value}>
          <idg-tab value="overview" disabled>
            Overview
          </idg-tab>
          <idg-tab value="activity">Activity</idg-tab>
          <idg-tab value="settings" disabled>
            Settings
          </idg-tab>
        </idg-tabs>,
      );
      expect(valueOf(root)).toBe("activity");
    }
  });

  it("follows a change of value", async () => {
    const { root, waitForChanges } = await render(basic);
    (root as TabsElement).value = "billing";
    await waitForChanges();
    expect(tabs(root).map((tab) => tab.selected)).toEqual([false, false, false, true]);
    expect(panels(root).map((panel) => panel.selected)).toEqual([false, false, false, true]);
  });

  it("does not report a change that script made", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(basic);
    const spy = spyOnEvent("idgChange");
    (root as TabsElement).value = "billing";
    await waitForChanges();
    expect(spy.length).toBe(0);
  });

  it("pairs by position the tabs and panels that have no value", async () => {
    const { root } = await render(
      <idg-tabs>
        <idg-tab>First</idg-tab>
        <idg-tab>Second</idg-tab>
        <idg-tab-panel>One</idg-tab-panel>
        <idg-tab-panel>Two</idg-tab-panel>
      </idg-tabs>,
    );
    expect(valueOf(root)).toBe("0");
    expect(panels(root).map((panel) => panel.selected)).toEqual([true, false]);
    expect(tabAt(root, 1).ariaControlsElements).toEqual([panels(root)[1]]);
  });

  it("makes the selected tab the only tab stop", async () => {
    const { root } = await render(basic);
    expect(tabs(root).map((tab) => tab.tabbable)).toEqual([true, false, false, false]);
  });

  it("links each tab to its panel, and each panel to its tab, with element references", async () => {
    const { root } = await render(basic);
    const [first, second] = tabs(root);
    const [firstPanel, secondPanel] = panels(root);
    expect(first?.ariaControlsElements).toEqual([firstPanel]);
    expect(second?.ariaControlsElements).toEqual([secondPanel]);
    expect(firstPanel?.ariaLabelledByElements).toEqual([first]);
    expect(secondPanel?.ariaLabelledByElements).toEqual([second]);
  });

  it("leaves a tab with no panel unlinked", async () => {
    const { root } = await render(
      <idg-tabs>
        <idg-tab value="a">A</idg-tab>
        <idg-tab value="b">B</idg-tab>
        <idg-tab-panel value="a">A</idg-tab-panel>
      </idg-tabs>,
    );
    expect(tabAt(root, 1).ariaControlsElements).toBeNull();
  });
});

describe("idg-tabs with the mouse", () => {
  it("selects a tab that is clicked and reports it once", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(basic);
    const spy = spyOnEvent("idgChange");
    tabAt(root, 1).click();
    await waitForChanges();
    expect(valueOf(root)).toBe("activity");
    expect(spy.length).toBe(1);
    expect(spy.lastEvent?.detail).toEqual({ value: "activity" });
    expect(tabs(root).map((tab) => tab.tabbable)).toEqual([false, true, false, false]);
  });

  it("says nothing when the selected tab is clicked", async () => {
    const { root, spyOnEvent } = await render(basic);
    const spy = spyOnEvent("idgChange");
    tabAt(root, 0).click();
    expect(spy.length).toBe(0);
  });

  it("ignores a disabled tab", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(basic);
    const spy = spyOnEvent("idgChange");
    tabAt(root, 2).click();
    await waitForChanges();
    expect(valueOf(root)).toBe("overview");
    expect(spy.length).toBe(0);
  });
});

describe("idg-tabs keyboard, with automatic activation", () => {
  it("moves to the next enabled tab with ArrowRight, selecting it and focusing it", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(basic);
    const focus = spyFocus(root);
    const spy = spyOnEvent("idgChange");
    const event = press(tabAt(root, 1), "ArrowRight");
    await waitForChanges();
    expect(event.defaultPrevented).toBe(true);
    // Settings is disabled, so the next tab is Billing.
    expect(valueOf(root)).toBe("billing");
    expect(focus[3]).toHaveBeenCalled();
    expect(spy.lastEvent?.detail).toEqual({ value: "billing" });
  });

  it("wraps round at either end", async () => {
    const { root, waitForChanges } = await render(basic);
    spyFocus(root);
    press(tabAt(root, 0), "ArrowLeft");
    await waitForChanges();
    expect(valueOf(root)).toBe("billing");
    press(tabAt(root, 3), "ArrowRight");
    await waitForChanges();
    expect(valueOf(root)).toBe("overview");
  });

  it("goes to the first and last enabled tab with Home and End", async () => {
    const { root, waitForChanges } = await render(basic);
    spyFocus(root);
    press(tabAt(root, 0), "End");
    await waitForChanges();
    expect(valueOf(root)).toBe("billing");
    press(tabAt(root, 3), "Home");
    await waitForChanges();
    expect(valueOf(root)).toBe("overview");
  });

  it("leaves the vertical arrows alone in a horizontal list", async () => {
    const { root } = await render(basic);
    expect(press(tabAt(root, 0), "ArrowDown").defaultPrevented).toBe(false);
    expect(press(tabAt(root, 0), "ArrowUp").defaultPrevented).toBe(false);
    expect(valueOf(root)).toBe("overview");
  });

  it("uses the vertical arrows, and not the horizontal ones, in a vertical list", async () => {
    const { root, waitForChanges } = await render(
      <idg-tabs orientation="vertical">
        <idg-tab value="a">A</idg-tab>
        <idg-tab value="b">B</idg-tab>
        <idg-tab-panel value="a">A</idg-tab-panel>
        <idg-tab-panel value="b">B</idg-tab-panel>
      </idg-tabs>,
    );
    spyFocus(root);
    expect(press(tabAt(root, 0), "ArrowRight").defaultPrevented).toBe(false);
    press(tabAt(root, 0), "ArrowDown");
    await waitForChanges();
    expect(valueOf(root)).toBe("b");
    press(tabAt(root, 1), "ArrowUp");
    await waitForChanges();
    expect(valueOf(root)).toBe("a");
  });

  it("swaps the horizontal arrows in right-to-left text", async () => {
    vi.spyOn(globalThis, "getComputedStyle").mockReturnValue({
      direction: "rtl",
    } as CSSStyleDeclaration);
    const { root, waitForChanges } = await render(basic);
    spyFocus(root);
    press(tabAt(root, 0), "ArrowLeft");
    await waitForChanges();
    expect(valueOf(root)).toBe("activity");
  });

  it("leaves other keys alone", async () => {
    const { root } = await render(basic);
    expect(press(tabAt(root, 0), "a").defaultPrevented).toBe(false);
    expect(press(tabAt(root, 0), "Tab").defaultPrevented).toBe(false);
  });

  it("ignores keys pressed inside a panel", async () => {
    const { root } = await render(
      <idg-tabs>
        <idg-tab value="a">A</idg-tab>
        <idg-tab value="b">B</idg-tab>
        <idg-tab-panel value="a">
          <input id="field" />
        </idg-tab-panel>
        <idg-tab-panel value="b">B</idg-tab-panel>
      </idg-tabs>,
    );
    const field = within(root, "#field");
    expect(press(field, "ArrowRight").defaultPrevented).toBe(false);
    expect(valueOf(root)).toBe("a");
  });

  it("does not wrap onto itself when it is the only enabled tab", async () => {
    const { root } = await render(
      <idg-tabs>
        <idg-tab value="a">A</idg-tab>
        <idg-tab value="b" disabled>
          B
        </idg-tab>
        <idg-tab-panel value="a">A</idg-tab-panel>
      </idg-tabs>,
    );
    expect(press(tabAt(root, 0), "ArrowRight").defaultPrevented).toBe(false);
  });

  it("selects the focused tab with Enter or Space too", async () => {
    const { root, waitForChanges } = await render(basic);
    spyFocus(root);
    expect(press(tabAt(root, 1), "Enter").defaultPrevented).toBe(true);
    await waitForChanges();
    expect(valueOf(root)).toBe("activity");
    press(tabAt(root, 3), " ");
    await waitForChanges();
    expect(valueOf(root)).toBe("billing");
  });

  it("does not select a disabled tab with Enter", async () => {
    const { root, waitForChanges } = await render(basic);
    press(tabAt(root, 2), "Enter");
    await waitForChanges();
    expect(valueOf(root)).toBe("overview");
  });
});

describe("idg-tabs keyboard, with manual activation", () => {
  const manual = (
    <idg-tabs activation="manual">
      <idg-tab value="a">A</idg-tab>
      <idg-tab value="b">B</idg-tab>
      <idg-tab value="c">C</idg-tab>
      <idg-tab-panel value="a">A</idg-tab-panel>
      <idg-tab-panel value="b">B</idg-tab-panel>
      <idg-tab-panel value="c">C</idg-tab-panel>
    </idg-tabs>
  );

  it("moves focus with the arrows, Home and End but does not select", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(manual);
    const focus = spyFocus(root);
    const spy = spyOnEvent("idgChange");
    press(tabAt(root, 0), "ArrowRight");
    expect(focus[1]).toHaveBeenCalled();
    press(tabAt(root, 1), "End");
    expect(focus[2]).toHaveBeenCalled();
    press(tabAt(root, 2), "Home");
    expect(focus[0]).toHaveBeenCalledTimes(1);
    await waitForChanges();
    expect(valueOf(root)).toBe("a");
    expect(spy.length).toBe(0);
  });

  it("selects the focused tab with Enter and with Space", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(manual);
    spyFocus(root);
    const spy = spyOnEvent("idgChange");
    press(tabAt(root, 1), "Enter");
    await waitForChanges();
    expect(valueOf(root)).toBe("b");
    press(tabAt(root, 2), " ");
    await waitForChanges();
    expect(valueOf(root)).toBe("c");
    expect(spy.length).toBe(2);
  });

  it("keeps the selected tab as the tab stop while focus moves", async () => {
    const { root, waitForChanges } = await render(manual);
    spyFocus(root);
    press(tabAt(root, 0), "ArrowRight");
    await waitForChanges();
    expect(tabs(root).map((tab) => tab.tabbable)).toEqual([true, false, false]);
  });
});

describe("idg-tabs when tabs come and go", () => {
  it("moves to the tab that takes the place of a selected tab that is removed", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(basic);
    const spy = spyOnEvent("idgChange");
    (root as TabsElement).value = "activity";
    await waitForChanges();
    tabAt(root, 1).remove();
    panels(root)[1]?.remove();
    slotchange(root);
    await waitForChanges();
    // Settings is disabled, so Billing is the next enabled tab.
    expect(valueOf(root)).toBe("billing");
    expect(tabs(root).map((tab) => tab.selected)).toEqual([false, false, true]);
    expect(panels(root).map((panel) => panel.selected)).toEqual([false, false, true]);
    expect(tabs(root).filter((tab) => tab.tabbable)).toHaveLength(1);
    expect(spy.length).toBe(0);
  });

  it("moves back when the selected tab was the last", async () => {
    const { root, waitForChanges } = await render(basic);
    (root as TabsElement).value = "billing";
    await waitForChanges();
    tabAt(root, 3).remove();
    slotchange(root);
    await waitForChanges();
    expect(valueOf(root)).toBe("activity");
  });

  it("keeps the selection when another tab is removed", async () => {
    const { root, waitForChanges } = await render(basic);
    (root as TabsElement).value = "billing";
    await waitForChanges();
    tabAt(root, 0).remove();
    slotchange(root);
    await waitForChanges();
    expect(valueOf(root)).toBe("billing");
  });

  it("picks up a tab and panel added later", async () => {
    const { root, waitForChanges } = await render(basic);
    const tab = document.createElement("idg-tab");
    tab.setAttribute("value", "audit");
    tab.textContent = "Audit";
    const panel = document.createElement("idg-tab-panel");
    panel.setAttribute("value", "audit");
    root.append(tab, panel);
    slotchange(root);
    await waitForChanges();
    expect(tab.getAttribute("slot")).toBe("tab");
    expect((panel as PanelElement).ariaLabelledByElements).toEqual([tab]);
    spyFocus(root);
    press(tabAt(root, 3), "ArrowRight");
    await waitForChanges();
    expect(valueOf(root)).toBe("audit");
  });

  it("follows tabs that are reordered", async () => {
    const { root, waitForChanges } = await render(basic);
    spyFocus(root);
    root.insertBefore(tabAt(root, 3), tabAt(root, 0));
    slotchange(root);
    await waitForChanges();
    expect(tabs(root).map((tab) => tab.value)).toEqual([
      "billing",
      "overview",
      "activity",
      "settings",
    ]);
    press(tabAt(root, 0), "ArrowRight");
    await waitForChanges();
    expect(valueOf(root)).toBe("overview");
  });

  it("selects another tab when the selected one is disabled", async () => {
    const watcher = stubMutationObserver();
    const { root, waitForChanges } = await render(basic);
    tabAt(root, 0).disabled = true;
    watcher.notify([{ type: "attributes", target: tabAt(root, 0) }]);
    await waitForChanges();
    expect(valueOf(root)).toBe("activity");
    watcher.restore();
  });

  it("does not look again for changes inside a panel", async () => {
    const watcher = stubMutationObserver();
    const { root, waitForChanges } = await render(
      <idg-tabs>
        <idg-tab value="a">A</idg-tab>
        <idg-tab-panel value="a">
          <span id="inside">x</span>
        </idg-tab-panel>
      </idg-tabs>,
    );
    const tab = tabAt(root, 0);
    const setter = vi.fn();
    Object.defineProperty(tab, "selected", { get: () => true, set: setter, configurable: true });
    watcher.notify([{ type: "attributes", target: within(root, "#inside") }]);
    await waitForChanges();
    expect(setter).not.toHaveBeenCalled();
    watcher.restore();
  });
});

describe("idg-tabs moved in the page", () => {
  it("stops watching when removed and watches again, catching up, when it is put back", async () => {
    const watcher = stubMutationObserver();
    const { root, waitForChanges } = await render(<div>{basic}</div>);
    const tabsElement = within(root, "idg-tabs") as TabsElement;
    const active = () => watcher.observers.filter((observer) => observer.observing);
    expect(active().some((observer) => observer.target === tabsElement)).toBe(true);
    removeHost(tabsElement);
    expect(active().some((observer) => observer.target === tabsElement)).toBe(false);
    const added = document.createElement("idg-tab");
    added.setAttribute("value", "audit");
    tabsElement.append(added);
    root.append(tabsElement);
    await waitForChanges();
    expect(active().some((observer) => observer.target === tabsElement)).toBe(true);
    expect(added.getAttribute("slot")).toBe("tab");
    watcher.restore();
  });

  it("keeps working from the keyboard after it is moved", async () => {
    const { root, waitForChanges } = await render(
      <div>
        {basic}
        <section />
      </div>,
    );
    const tabsElement = within(root, "idg-tabs") as TabsElement;
    spyFocus(tabsElement);
    removeHost(tabsElement);
    root.querySelector("section")?.append(tabsElement);
    await waitForChanges();
    press(tabAt(tabsElement, 0), "ArrowRight");
    await waitForChanges();
    expect(valueOf(tabsElement)).toBe("activity");
  });
});

describe("idg-tabs duplicates, unmatched values and nesting", () => {
  it("warns of a value two tabs share, naming it, and only once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { root, waitForChanges } = await render(
      <idg-tabs>
        <idg-tab value="a">A</idg-tab>
        <idg-tab value="a">Again</idg-tab>
        <idg-tab-panel value="a">A body</idg-tab-panel>
      </idg-tabs>,
    );
    (root as TabsElement).value = "a";
    await waitForChanges();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('"a"');
  });

  it("does not warn for tabs without a value, which are known by position", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await render(
      <idg-tabs>
        <idg-tab>A</idg-tab>
        <idg-tab>B</idg-tab>
      </idg-tabs>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("moves to the enabled tab nearest the selection when the value names no tab", async () => {
    const { root, waitForChanges } = await render(basic);
    tabAt(root, 3).click();
    await waitForChanges();
    (root as TabsElement).value = "missing";
    await waitForChanges();
    expect(valueOf(root)).toBe("billing");
  });

  it("does not select a tab of tabs nested in one of its panels", async () => {
    const { root, waitForChanges } = await render(
      <idg-tabs>
        <idg-tab value="outer">Outer</idg-tab>
        <idg-tab value="other">Other</idg-tab>
        <idg-tab-panel value="outer">
          <idg-tabs id="inner">
            <idg-tab value="x">X</idg-tab>
            <idg-tab value="y">Y</idg-tab>
            <idg-tab-panel value="x">X body</idg-tab-panel>
            <idg-tab-panel value="y">Y body</idg-tab-panel>
          </idg-tabs>
        </idg-tab-panel>
        <idg-tab-panel value="other">Other body</idg-tab-panel>
      </idg-tabs>,
    );
    const inner = within(root, "#inner");
    const second = inner.querySelectorAll<HTMLElement>("idg-tab")[1];
    if (!second) throw new Error("no second tab");
    second.click();
    await waitForChanges();
    expect((inner as TabsElement).value).toBe("y");
    expect(valueOf(root)).toBe("outer");
    press(second, "ArrowLeft");
    await waitForChanges();
    expect(valueOf(root)).toBe("outer");
  });
});
