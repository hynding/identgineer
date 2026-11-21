import { beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installPopoverElement } from "../../testing/popover-element";
import "../menu-group/menu-group";
import "../menu-item/menu-item";
import "../menu-separator/menu-separator";
import { removeHost } from "../../testing/remove-host";
import "./menu";

interface MenuItem extends HTMLElement {
  value: string;
  checked: boolean;
  setFocus: () => Promise<void>;
}

interface MenuTrigger extends HTMLElement {
  ariaExpanded: string | null;
  ariaHasPopup: string | null;
}

beforeEach(() => {
  installPopoverElement();
});

const actions = (
  <idg-menu>
    <button slot="trigger">Actions</button>
    <idg-menu-item value="edit">Edit</idg-menu-item>
    <idg-menu-item value="duplicate">Duplicate</idg-menu-item>
    <idg-menu-item value="archive" disabled>
      Archive
    </idg-menu-item>
    <idg-menu-separator />
    <idg-menu-group label="Sort by">
      <idg-menu-item type="radio" value="name" checked>
        Name
      </idg-menu-item>
      <idg-menu-item type="radio" value="date">
        Date
      </idg-menu-item>
    </idg-menu-group>
    <idg-menu-item type="checkbox" value="grid">
      Show grid
    </idg-menu-item>
    <idg-menu-item value="delete">Delete</idg-menu-item>
  </idg-menu>
);

function items(root: HTMLElement): MenuItem[] {
  return Array.from(root.querySelectorAll<MenuItem>("idg-menu-item"));
}

function itemByValue(root: HTMLElement, value: string): MenuItem {
  const found = items(root).find((candidate) => candidate.value === value);
  if (!found) throw new Error(`no item ${value}`);
  return found;
}

function itemAt(root: HTMLElement, index: number): MenuItem {
  const found = items(root)[index];
  if (!found) throw new Error(`no item ${String(index)}`);
  return found;
}

function trigger(root: HTMLElement): MenuTrigger {
  const element = root.querySelector<MenuTrigger>('[slot="trigger"]');
  if (!element) throw new Error("no trigger");
  return element;
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
  return items(root).map((item) => vi.spyOn(item, "setFocus").mockResolvedValue(undefined));
}

async function openMenu(root: HTMLElement, waitForChanges: () => Promise<void>) {
  trigger(root).click();
  await waitForChanges();
}

describe("idg-menu rendering", () => {
  it("renders a menu inside an auto popover, with the trigger outside it", async () => {
    const { root } = await render(actions);
    const surface = root.shadowRoot?.querySelector('[part="surface"]');
    expect(surface?.getAttribute("popover")).toBe("auto");
    // Browsers expose a popover as an unnamed group, which would wrap the menu in noise.
    expect(surface?.getAttribute("role")).toBe("none");
    const menu = surface?.querySelector('[role="menu"]');
    expect(menu?.querySelector("slot:not([name])")).not.toBeNull();
    expect(root.shadowRoot?.querySelector('slot[name="trigger"]')).not.toBeNull();
  });

  it("names the menu with its label", async () => {
    const { root } = await render(
      <idg-menu label="Project actions">
        <button slot="trigger">More</button>
      </idg-menu>,
    );
    expect(root.shadowRoot?.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe(
      "Project actions",
    );
  });

  it("tells the trigger it opens a menu and is collapsed", async () => {
    const { root } = await render(actions);
    expect(trigger(root).ariaHasPopup).toBe("menu");
    expect(trigger(root).ariaExpanded).toBe("false");
  });
});

describe("idg-menu opening", () => {
  it("opens on a click of the trigger and focuses the first item", async () => {
    const { root, waitForChanges } = await render(actions);
    const focus = spyFocus(root);
    await openMenu(root, waitForChanges);
    expect(root.hasAttribute("open")).toBe(true);
    expect(trigger(root).ariaExpanded).toBe("true");
    expect(focus[0]).toHaveBeenCalled();
  });

  it("opens on ArrowDown at the first item and ArrowUp at the last", async () => {
    const { root, waitForChanges } = await render(actions);
    const focus = spyFocus(root);
    expect(press(trigger(root), "ArrowUp").defaultPrevented).toBe(true);
    await waitForChanges();
    expect(focus[focus.length - 1]).toHaveBeenCalled();
    press(itemAt(root, 0), "Escape");
    await waitForChanges();
    press(trigger(root), "ArrowDown");
    await waitForChanges();
    expect(focus[0]).toHaveBeenCalled();
  });
});

describe("idg-menu keyboard", () => {
  it("moves with the arrow keys, wrapping, and to the ends with Home and End", async () => {
    const { root, waitForChanges } = await render(actions);
    await openMenu(root, waitForChanges);
    const all = items(root);
    const focus = spyFocus(root);
    press(itemAt(root, 0), "ArrowDown");
    expect(focus[1]).toHaveBeenCalledTimes(1);
    press(itemAt(root, 0), "ArrowUp");
    expect(focus[all.length - 1]).toHaveBeenCalledTimes(1);
    press(itemAt(root, 3), "Home");
    expect(focus[0]).toHaveBeenCalledTimes(1);
    press(itemAt(root, 0), "End");
    expect(focus[all.length - 1]).toHaveBeenCalledTimes(2);
  });

  it("reaches a disabled item, so it can be found", async () => {
    const { root, waitForChanges } = await render(actions);
    await openMenu(root, waitForChanges);
    const focus = spyFocus(root);
    press(itemAt(root, 1), "ArrowDown");
    expect(focus[2]).toHaveBeenCalled();
  });

  it("moves to the next item that starts with the typed text", async () => {
    const { root, waitForChanges } = await render(actions);
    await openMenu(root, waitForChanges);
    const focus = spyFocus(root);
    press(itemAt(root, 0), "d");
    expect(focus[1]).toHaveBeenCalled();
    press(itemAt(root, 1), "e");
    expect(focus[items(root).length - 1]).toHaveBeenCalled();
  });

  it("activates an item with Enter, emits idgSelect and closes", async () => {
    const { root, waitForChanges } = await render(actions);
    const selected = vi.fn();
    root.addEventListener("idgSelect", selected);
    await openMenu(root, waitForChanges);
    expect(press(itemByValue(root, "duplicate"), "Enter").defaultPrevented).toBe(true);
    await waitForChanges();
    expect((selected.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ value: "duplicate" });
    expect(root.hasAttribute("open")).toBe(false);
  });

  it("toggles a checkbox item with Space and stays open", async () => {
    const { root, waitForChanges } = await render(actions);
    const selected = vi.fn();
    root.addEventListener("idgSelect", selected);
    await openMenu(root, waitForChanges);
    press(itemByValue(root, "grid"), " ");
    await waitForChanges();
    expect(itemByValue(root, "grid").checked).toBe(true);
    expect((selected.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      value: "grid",
      checked: true,
    });
    expect(root.hasAttribute("open")).toBe(true);
  });

  it("checks one radio item of a group and unchecks the others", async () => {
    const { root, waitForChanges } = await render(actions);
    await openMenu(root, waitForChanges);
    press(itemByValue(root, "date"), "Enter");
    await waitForChanges();
    expect(itemByValue(root, "date").checked).toBe(true);
    expect(itemByValue(root, "name").checked).toBe(false);
  });

  it("does not activate a disabled item", async () => {
    const { root, waitForChanges } = await render(actions);
    const selected = vi.fn();
    root.addEventListener("idgSelect", selected);
    await openMenu(root, waitForChanges);
    press(itemByValue(root, "archive"), "Enter");
    await waitForChanges();
    expect(selected).not.toHaveBeenCalled();
    expect(root.hasAttribute("open")).toBe(true);
  });

  it.each(["Escape", "Tab"])("closes on %s", async (key) => {
    const { root, waitForChanges } = await render(actions);
    await openMenu(root, waitForChanges);
    press(itemAt(root, 0), key);
    await waitForChanges();
    expect(root.hasAttribute("open")).toBe(false);
    expect(trigger(root).ariaExpanded).toBe("false");
  });
});

describe("idg-menu pointer", () => {
  it("activates an item on click", async () => {
    const { root, waitForChanges } = await render(actions);
    const selected = vi.fn();
    root.addEventListener("idgSelect", selected);
    await openMenu(root, waitForChanges);
    itemByValue(root, "edit").click();
    await waitForChanges();
    expect((selected.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ value: "edit" });
  });

  it("ignores a click on the trigger as an item", async () => {
    const { root, waitForChanges } = await render(actions);
    const selected = vi.fn();
    root.addEventListener("idgSelect", selected);
    await openMenu(root, waitForChanges);
    expect(selected).not.toHaveBeenCalled();
  });
});

describe("idg-menu moved or loaded open", () => {
  it("closes when removed while open, so it collapses its trigger and opens again", async () => {
    const { root, waitForChanges } = await render(<div>{actions}</div>);
    const menu = root.querySelector("idg-menu") as HTMLElement & { open: boolean };
    spyFocus(menu);
    const closed = vi.fn();
    menu.addEventListener("idgClose", closed);
    await openMenu(menu, waitForChanges);
    expect(menu.open).toBe(true);
    removeHost(menu);
    // A browser hides a removed popover without a toggle event.
    menu.shadowRoot?.querySelector('[part="surface"]')?.removeAttribute("data-popover-open");
    expect(closed).toHaveBeenCalledTimes(1);
    expect(menu.open).toBe(false);
    root.append(menu);
    await waitForChanges();
    expect(trigger(menu).ariaExpanded).toBe("false");
    await openMenu(menu, waitForChanges);
    expect(menu.open).toBe(true);
    expect(trigger(menu).ariaExpanded).toBe("true");
  });

  it("does not take focus when it is open in the page's markup", async () => {
    const focus = vi.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(document.createElement("div"))) as HTMLElement,
      "focus",
    );
    const { root } = await render(
      <idg-menu open>
        <button slot="trigger">Actions</button>
        <idg-menu-item value="edit">Edit</idg-menu-item>
      </idg-menu>,
    );
    expect(root.open).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });
});
