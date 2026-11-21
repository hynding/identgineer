import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installAriaReflection } from "../../testing/aria-reflection";
import { installDialogElement } from "../../testing/dialog-element";
import { installSlotAssignment } from "../../testing/slot-assignment";
import { stubConstructableStylesheets } from "../../testing/constructable-stylesheet";
import { stubResizeObserver } from "../../testing/resize-observer";
import type { NavigationMode } from "./layout-options";
import "./layout";

interface LayoutHost extends HTMLElement {
  navigationOpen: boolean;
}

interface ReflectingButton extends HTMLButtonElement {
  ariaControlsElements: Element[] | null;
}

let dialog: ReturnType<typeof installDialogElement>;
let resize: ReturnType<typeof stubResizeObserver>;
let sheets: ReturnType<typeof stubConstructableStylesheets>;
let mode: NavigationMode;

function shows(next: NavigationMode): void {
  mode = next;
  vi.spyOn(globalThis, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => (name === "--_nav" ? mode : ""),
      }) as unknown as CSSStyleDeclaration,
  );
}

beforeEach(() => {
  installSlotAssignment();
  installAriaReflection();
  dialog = installDialogElement();
  resize = stubResizeObserver();
  sheets = stubConstructableStylesheets();
  shows("inline");
});

afterEach(() => {
  vi.restoreAllMocks();
  resize.restore();
  sheets.restore();
});

const page = (
  <idg-layout>
    <a slot="brand" href="/">
      Brand
    </a>
    <a slot="navigation" href="/one">
      One
    </a>
    <a slot="navigation" href="/two">
      Two
    </a>
    <button slot="actions">Sign in</button>
    <section slot="hero">Hero</section>
    <p>Content</p>
    <p slot="aside">Aside</p>
    <p slot="footer">Footer</p>
  </idg-layout>
);

function shadow(root: HTMLElement): ShadowRoot {
  if (!root.shadowRoot) throw new Error("no shadow root");
  return root.shadowRoot;
}

function part(root: HTMLElement, name: string): HTMLElement {
  const element = shadow(root).querySelector<HTMLElement>(`[part="${name}"]`);
  if (!element) throw new Error(`no ${name} part`);
  return element;
}

function toggle(root: HTMLElement): ReflectingButton {
  return part(root, "toggle") as ReflectingButton;
}

function drawer(root: HTMLElement): HTMLDialogElement {
  return part(root, "drawer") as HTMLDialogElement;
}

describe("idg-layout landmarks", () => {
  it("draws a banner, a labelled navigation, one main, a labelled aside and a footer", async () => {
    const { root } = await render(page);
    const tree = shadow(root);
    expect(tree.querySelectorAll("header")).toHaveLength(1);
    expect(tree.querySelectorAll("main")).toHaveLength(1);
    expect(tree.querySelectorAll("footer")).toHaveLength(1);
    expect(tree.querySelector("nav")?.getAttribute("aria-label")).toBe("Main navigation");
    expect(tree.querySelector("aside")?.getAttribute("aria-label")).toBe("Related content");
    expect(tree.querySelector("main")?.getAttribute("id")).toBe("main");
  });

  it("takes the labels from props", async () => {
    const { root } = await render(
      <idg-layout navigation-label="Primary" aside-label="Related links">
        <a slot="navigation" href="/one">
          One
        </a>
        <p slot="aside">Aside</p>
        Content
      </idg-layout>,
    );
    expect(shadow(root).querySelector("nav")?.getAttribute("aria-label")).toBe("Primary");
    expect(shadow(root).querySelector("aside")?.getAttribute("aria-label")).toBe("Related links");
  });

  it("puts every region in the shadow tree in reading order, whatever the layout", async () => {
    const { root } = await render(page);
    const shell = part(root, "shell");
    const regions = Array.from(shell.children).map((child) => child.getAttribute("part"));
    expect(regions).toEqual(["skip", "header", "hero", "main", "aside", "footer"]);
    const header = Array.from(part(root, "header").children).map((child) =>
      child.getAttribute("part"),
    );
    expect(header).toEqual(["brand", "toggle", "drawer", "actions"]);
  });

  it("gives each region its own slot, and the content the default slot", async () => {
    const { root } = await render(page);
    const tree = shadow(root);
    for (const name of ["brand", "navigation", "actions", "hero", "aside", "footer"]) {
      expect(tree.querySelectorAll(`slot[name="${name}"]`), name).toHaveLength(1);
    }
    expect(part(root, "main").querySelector("slot:not([name])")).not.toBeNull();
  });

  it("hides the regions nothing is slotted into, so no empty landmark is announced", async () => {
    const { root } = await render(<idg-layout>Content</idg-layout>);
    for (const name of ["hero", "aside", "footer", "header"]) {
      expect(part(root, name).hasAttribute("hidden"), name).toBe(true);
    }
    expect(part(root, "main").hasAttribute("hidden")).toBe(false);
  });

  it("shows the regions that have content", async () => {
    const { root } = await render(page);
    for (const name of ["hero", "aside", "footer", "header", "brand", "actions", "drawer"]) {
      expect(part(root, name).hasAttribute("hidden"), name).toBe(false);
    }
  });

  it("adds no heading, no inline style and no tab stop of its own beyond the controls", async () => {
    const { root } = await render(page);
    const tree = shadow(root);
    expect(tree.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']")).toHaveLength(0);
    for (const element of Array.from(tree.querySelectorAll("*"))) {
      expect(element.hasAttribute("style"), element.outerHTML).toBe(false);
    }
    const stops = Array.from(tree.querySelectorAll("[tabindex]")).map((element) => [
      element.getAttribute("part"),
      element.getAttribute("tabindex"),
    ]);
    expect(stops).toEqual([["main", "-1"]]);
  });
});

describe("idg-layout skip link", () => {
  it("is the first thing in the shell, named by a prop, and points at main", async () => {
    const { root } = await render(page);
    const skip = part(root, "skip");
    expect(part(root, "shell").firstElementChild).toBe(skip);
    expect(skip.textContent).toBe("Skip to content");
    expect(skip.getAttribute("href")).toBe("#main");
    const { root: other } = await render(<idg-layout skip-label="Jump to the page">x</idg-layout>);
    expect(part(other, "skip").textContent).toBe("Jump to the page");
  });

  it("moves focus to main instead of navigating", async () => {
    const { root } = await render(page);
    const focus = vi.spyOn(part(root, "main"), "focus");
    const click = new Event("click", { cancelable: true, bubbles: true });
    part(root, "skip").dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe("idg-layout navigation toggle", () => {
  it("is a button that says it is collapsed and controls the drawer", async () => {
    const { root } = await render(page);
    const button = toggle(root);
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.ariaControlsElements).toEqual([drawer(root)]);
    expect(button.textContent).toContain("Menu");
  });

  it("is named by a prop", async () => {
    const { root } = await render(
      <idg-layout menu-label="Sections">
        <a slot="navigation" href="/one">
          One
        </a>
        Content
      </idg-layout>,
    );
    expect(toggle(root).textContent).toContain("Sections");
  });

  it("has no toggle when there is no navigation", async () => {
    const { root } = await render(<idg-layout>Content</idg-layout>);
    expect(part(root, "toggle").hasAttribute("hidden")).toBe(true);
  });

  it("does not take the navigation out of the page while the stylesheet draws it inline", async () => {
    const { root } = await render(page);
    expect(drawer(root).getAttribute("role")).toBe("group");
    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(dialog.show).not.toHaveBeenCalled();
  });
});

describe("idg-layout drawer", () => {
  beforeEach(() => {
    shows("drawer");
  });

  it("opens as a modal dialog, with its own name, and says so on the toggle", async () => {
    const { root, waitForChanges } = await render(page);
    toggle(root).click();
    await waitForChanges();
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect((root as LayoutHost).navigationOpen).toBe(true);
    expect(toggle(root).getAttribute("aria-expanded")).toBe("true");
    expect(drawer(root).hasAttribute("role")).toBe(false);
    expect(drawer(root).getAttribute("aria-label")).toBe("Menu");
  });

  it("holds the page still while it is open and lets go when it closes", async () => {
    const { root, waitForChanges } = await render(page);
    toggle(root).click();
    await waitForChanges();
    expect(sheets.sheets().some((sheet) => sheet.css.includes("overflow: hidden"))).toBe(true);
    toggle(root).click();
    await waitForChanges();
    expect(sheets.sheets().some((sheet) => sheet.css.includes("overflow: hidden"))).toBe(false);
  });

  it("closes with Escape, as the browser's cancel, and gives focus back to the toggle", async () => {
    const { root, waitForChanges } = await render(page);
    toggle(root).click();
    await waitForChanges();
    const focus = vi.spyOn(toggle(root), "focus");
    const cancel = new Event("cancel", { cancelable: true });
    drawer(root).dispatchEvent(cancel);
    await waitForChanges();
    expect(cancel.defaultPrevented).toBe(true);
    expect((root as LayoutHost).navigationOpen).toBe(false);
    expect(drawer(root).hasAttribute("open")).toBe(false);
    expect(toggle(root).getAttribute("aria-expanded")).toBe("false");
    expect(focus).toHaveBeenCalled();
  });

  it("has a close button of its own, which closes it", async () => {
    const { root, waitForChanges } = await render(
      <idg-layout close-label="Dismiss">
        <a slot="navigation" href="/one">
          One
        </a>
        Content
      </idg-layout>,
    );
    toggle(root).click();
    await waitForChanges();
    const close = part(root, "close");
    expect(close.getAttribute("aria-label")).toBe("Dismiss");
    close.click();
    await waitForChanges();
    expect((root as LayoutHost).navigationOpen).toBe(false);
  });

  it("opens when navigation-open is set, and tells the page", async () => {
    const { root, waitForChanges } = await render(page);
    const events: boolean[] = [];
    root.addEventListener("idgNavigationToggle", (event) => {
      events.push((event as CustomEvent<{ open: boolean }>).detail.open);
    });
    (root as LayoutHost).navigationOpen = true;
    await waitForChanges();
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    (root as LayoutHost).navigationOpen = false;
    await waitForChanges();
    expect(events).toEqual([true, false]);
  });

  it("is reset when the container grows and the navigation is drawn inline again", async () => {
    const { root, waitForChanges } = await render(page);
    toggle(root).click();
    await waitForChanges();
    shows("inline");
    resize.notify();
    await waitForChanges();
    expect((root as LayoutHost).navigationOpen).toBe(false);
    expect(drawer(root).hasAttribute("open")).toBe(false);
    expect(drawer(root).getAttribute("role")).toBe("group");
    expect(sheets.sheets().some((sheet) => sheet.css.includes("overflow: hidden"))).toBe(false);
  });

  it("cannot be opened while the navigation is inline", async () => {
    shows("inline");
    const { root, waitForChanges } = await render(page);
    (root as LayoutHost).navigationOpen = true;
    await waitForChanges();
    expect((root as LayoutHost).navigationOpen).toBe(false);
    expect(dialog.showModal).not.toHaveBeenCalled();
  });

  it("closes when a link inside it is followed", async () => {
    const { root, waitForChanges } = await render(page);
    toggle(root).click();
    await waitForChanges();
    root.querySelector<HTMLElement>('[slot="navigation"]')?.click();
    await waitForChanges();
    expect((root as LayoutHost).navigationOpen).toBe(false);
  });

  it("releases the page if it is removed while open", async () => {
    const { root, waitForChanges } = await render(page);
    toggle(root).click();
    await waitForChanges();
    root.remove();
    expect(sheets.sheets().some((sheet) => sheet.css.includes("overflow: hidden"))).toBe(false);
  });
});

describe("idg-layout disclosure", () => {
  beforeEach(() => {
    shows("disclosure");
  });

  it("opens in the flow of the page, not modal, and leaves focus where it is", async () => {
    const { root, waitForChanges } = await render(page);
    toggle(root).click();
    await waitForChanges();
    expect(dialog.show).toHaveBeenCalledTimes(1);
    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(toggle(root).getAttribute("aria-expanded")).toBe("true");
    expect(sheets.sheets().some((sheet) => sheet.css.includes("overflow: hidden"))).toBe(false);
    expect(drawer(root).getAttribute("role")).toBe("group");
  });

  it("closes with Escape and returns focus to the toggle", async () => {
    const { root, waitForChanges } = await render(page);
    toggle(root).click();
    await waitForChanges();
    const focus = vi.spyOn(toggle(root), "focus");
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true });
    root.querySelector('[slot="navigation"]')?.dispatchEvent(escape);
    await waitForChanges();
    expect((root as LayoutHost).navigationOpen).toBe(false);
    expect(focus).toHaveBeenCalled();
  });

  it("ignores Escape while closed", async () => {
    const { root, waitForChanges } = await render(page);
    const focus = vi.spyOn(toggle(root), "focus");
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await waitForChanges();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("idg-layout page chrome", () => {
  it("pads the page's own scroll while a shell is on it, and takes the padding away with it", async () => {
    const { root } = await render(page);
    expect(sheets.sheets().map((sheet) => sheet.css)).toContain(
      ":root { scroll-padding-block-start: var(--idg-layout-sticky-inset); }",
    );
    root.remove();
    expect(sheets.sheets()).toHaveLength(0);
  });
});

describe("idg-layout navigation that is open from the start, and the Escape key", () => {
  it("opens the drawer once loaded when navigation-open is in the markup", async () => {
    shows("drawer");
    const { root, waitForChanges } = await render(
      <idg-layout navigation-open>
        <a slot="navigation" href="/one">
          One
        </a>
        Content
      </idg-layout>,
    );
    await waitForChanges();
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(toggle(root).getAttribute("aria-expanded")).toBe("true");
    expect(drawer(root).hasAttribute("open")).toBe(true);
  });

  it("opens the panel once loaded when the layout shows the navigation as a panel", async () => {
    shows("disclosure");
    const { root, waitForChanges } = await render(
      <idg-layout navigation-open>
        <a slot="navigation" href="/one">
          One
        </a>
        Content
      </idg-layout>,
    );
    await waitForChanges();
    expect(dialog.show).toHaveBeenCalledTimes(1);
    expect(drawer(root).hasAttribute("open")).toBe(true);
  });

  it("starts closed when navigation-open is set but the navigation is drawn inline", async () => {
    shows("inline");
    const { root, waitForChanges } = await render(
      <idg-layout navigation-open>
        <a slot="navigation" href="/one">
          One
        </a>
        Content
      </idg-layout>,
    );
    await waitForChanges();
    expect((root as LayoutHost).navigationOpen).toBe(false);
  });

  describe("with a panel open", () => {
    beforeEach(() => {
      shows("disclosure");
    });

    async function opened() {
      const rendered = await render(page);
      toggle(rendered.root).click();
      await rendered.waitForChanges();
      return rendered;
    }

    it("is not closed by an Escape that happens in the content of the page", async () => {
      const { root, waitForChanges } = await opened();
      const focus = vi.spyOn(toggle(root), "focus");
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true });
      root.querySelector("p")?.dispatchEvent(escape);
      await waitForChanges();
      expect((root as LayoutHost).navigationOpen).toBe(true);
      expect(focus).not.toHaveBeenCalled();
    });

    it("is not closed by an Escape that something already used", async () => {
      const { root, waitForChanges } = await opened();
      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      escape.preventDefault();
      root.querySelector('[slot="navigation"]')?.dispatchEvent(escape);
      await waitForChanges();
      expect((root as LayoutHost).navigationOpen).toBe(true);
    });

    it("is not closed by an Escape in the actions, which are not part of the panel", async () => {
      const { root, waitForChanges } = await opened();
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true });
      root.querySelector('[slot="actions"]')?.dispatchEvent(escape);
      await waitForChanges();
      expect((root as LayoutHost).navigationOpen).toBe(true);
    });

    it("is closed from the page without moving focus the page has put elsewhere", async () => {
      const { root, waitForChanges } = await opened();
      const focus = vi.spyOn(toggle(root), "focus");
      (root as LayoutHost).navigationOpen = false;
      await waitForChanges();
      expect(focus).not.toHaveBeenCalled();
    });

    it("is not closed by a click that opens the link elsewhere or is not the primary button", async () => {
      const { root, waitForChanges } = await opened();
      const link = root.querySelector('[slot="navigation"]');
      for (const init of [
        { ctrlKey: true },
        { metaKey: true },
        { shiftKey: true },
        { button: 1 },
      ]) {
        link?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, ...init }));
        await waitForChanges();
        expect((root as LayoutHost).navigationOpen).toBe(true);
      }
    });
  });
});

describe("idg-layout regions that are missing and a shell that is embedded", () => {
  it("says on the shell that there is no hero, so a layout can arrange itself without one", async () => {
    const without = await render(
      <idg-layout>
        <a slot="navigation" href="/one">
          One
        </a>
        Content
      </idg-layout>,
    );
    expect(part(without.root, "shell").classList.contains("no-hero")).toBe(true);
    const withHero = await render(page);
    expect(part(withHero.root, "shell").classList.contains("no-hero")).toBe(false);
  });

  it("reflects embedded, so the shell can stop claiming the height of the window", async () => {
    const { root } = await render(<idg-layout embedded>Content</idg-layout>);
    expect(root.hasAttribute("embedded")).toBe(true);
    const plain = await render(<idg-layout>Content</idg-layout>);
    expect(plain.root.hasAttribute("embedded")).toBe(false);
  });
});
