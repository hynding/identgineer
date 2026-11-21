import { describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import "./pagination";

function nav(root: HTMLElement): Element {
  const found = root.shadowRoot?.querySelector("nav");
  if (!found) throw new Error("no nav");
  return found;
}

function controls(root: HTMLElement): HTMLElement[] {
  return Array.from(nav(root).querySelectorAll<HTMLElement>(".control"));
}

/** What each control shows: its page number, or `<` and `>` for previous and next. */
function shown(root: HTMLElement): string[] {
  return controls(root).map((control) => {
    if (control.getAttribute("part") === "previous") return "<";
    if (control.getAttribute("part") === "next") return ">";
    return control.textContent.trim();
  });
}

function pageControl(root: HTMLElement, page: number): HTMLElement {
  const found = controls(root).find(
    (control) =>
      control.getAttribute("part") === "page" && control.textContent.trim() === String(page),
  );
  if (!found) throw new Error(`no control for page ${String(page)}`);
  return found;
}

function part(root: HTMLElement, name: "previous" | "next"): HTMLElement {
  const found = controls(root).find((control) => control.getAttribute("part") === name);
  if (!found) throw new Error(`no ${name} control`);
  return found;
}

describe("idg-pagination rendering", () => {
  it("is a navigation landmark named Pagination holding a list", async () => {
    const { root } = await render(<idg-pagination pageCount={5} />);
    expect(nav(root).getAttribute("aria-label")).toBe("Pagination");
    expect(nav(root).querySelectorAll("ul > li").length).toBeGreaterThan(0);
  });

  it("takes its name from the label", async () => {
    const { root } = await render(<idg-pagination pageCount={5} label="Results pages" />);
    expect(nav(root).getAttribute("aria-label")).toBe("Results pages");
  });

  it("shows previous, every page that fits, then next", async () => {
    const { root } = await render(<idg-pagination pageCount={5} page={2} />);
    expect(shown(root)).toEqual(["<", "1", "2", "3", "4", "5", ">"]);
  });

  it("leaves pages out of a long list, hiding the gap from assistive technology", async () => {
    const { root } = await render(<idg-pagination pageCount={10} page={5} />);
    expect(shown(root)).toEqual(["<", "1", "4", "5", "6", "10", ">"]);
    const gaps = Array.from(nav(root).querySelectorAll("li.gap"));
    expect(gaps).toHaveLength(2);
    expect(gaps.every((gap) => gap.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("widens the window with siblings and boundaries", async () => {
    const { root } = await render(
      <idg-pagination pageCount={20} page={10} siblings={2} boundaries={2} />,
    );
    expect(shown(root)).toEqual(["<", "1", "2", "8", "9", "10", "11", "12", "19", "20", ">"]);
  });

  it("marks the current page and no other, and names every page control", async () => {
    const { root } = await render(<idg-pagination pageCount={5} page={3} />);
    const pages = controls(root).filter((control) => control.getAttribute("part") === "page");
    expect(pages.map((control) => control.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "page",
      null,
      null,
    ]);
    expect(pages.map((control) => control.getAttribute("aria-label"))).toEqual([
      "Page 1",
      "Page 2",
      "Page 3",
      "Page 4",
      "Page 5",
    ]);
  });

  it("takes the control names from its labels", async () => {
    const { root } = await render(
      <idg-pagination
        pageCount={3}
        page={2}
        previousLabel="Précédent"
        nextLabel="Suivant"
        pageLabel="Page {page} sur 3"
      />,
    );
    expect(part(root, "previous").getAttribute("aria-label")).toBe("Précédent");
    expect(part(root, "next").getAttribute("aria-label")).toBe("Suivant");
    expect(pageControl(root, 1).getAttribute("aria-label")).toBe("Page 1 sur 3");
  });

  it("keeps a page outside the range inside it", async () => {
    const { root } = await render(<idg-pagination pageCount={5} page={9} />);
    expect(pageControl(root, 5).getAttribute("aria-current")).toBe("page");
  });

  it("follows a change of page", async () => {
    const { root, waitForChanges } = await render(<idg-pagination pageCount={5} page={1} />);
    (root as unknown as { page: number }).page = 4;
    await waitForChanges();
    expect(pageControl(root, 4).getAttribute("aria-current")).toBe("page");
    expect(pageControl(root, 1).hasAttribute("aria-current")).toBe(false);
  });

  it("draws previous and next as decoration inside controls that are named", async () => {
    const { root } = await render(<idg-pagination pageCount={3} page={2} />);
    for (const name of ["previous", "next"] as const) {
      const control = part(root, name);
      expect(control.getAttribute("aria-label")).not.toBeNull();
      expect(control.querySelector("idg-icon")).not.toBeNull();
    }
  });
});

describe("idg-pagination as buttons", () => {
  it("draws buttons, and disables previous on the first page and next on the last", async () => {
    const first = await render(<idg-pagination pageCount={3} page={1} />);
    expect(controls(first.root).every((control) => control.localName === "button")).toBe(true);
    expect(part(first.root, "previous").hasAttribute("disabled")).toBe(true);
    expect(part(first.root, "next").hasAttribute("disabled")).toBe(false);
    const last = await render(<idg-pagination pageCount={3} page={3} />);
    expect(part(last.root, "next").hasAttribute("disabled")).toBe(true);
    expect(part(last.root, "previous").hasAttribute("disabled")).toBe(false);
  });

  it("emits idgPageChange and moves to the page that is clicked", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<idg-pagination pageCount={5} />);
    const spy = spyOnEvent("idgPageChange");
    pageControl(root, 3).click();
    await waitForChanges();
    expect(spy.length).toBe(1);
    expect(spy.lastEvent?.detail).toEqual({ page: 3 });
    expect((root as unknown as { page: number }).page).toBe(3);
  });

  it("moves with previous and next", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-pagination pageCount={5} page={3} />,
    );
    const spy = spyOnEvent("idgPageChange");
    part(root, "next").click();
    await waitForChanges();
    expect(spy.lastEvent?.detail).toEqual({ page: 4 });
    part(root, "previous").click();
    part(root, "previous").click();
    await waitForChanges();
    expect(spy.events.map((event) => (event.detail as { page: number }).page)).toEqual([4, 3, 2]);
  });

  it("says nothing when the current page is clicked", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-pagination pageCount={5} page={2} />,
    );
    const spy = spyOnEvent("idgPageChange");
    pageControl(root, 2).click();
    await waitForChanges();
    expect(spy.length).toBe(0);
  });

  it("stays on the page when the event is cancelled", async () => {
    const { root, waitForChanges } = await render(<idg-pagination pageCount={5} page={1} />);
    root.addEventListener("idgPageChange", (event) => {
      event.preventDefault();
    });
    pageControl(root, 4).click();
    await waitForChanges();
    expect((root as unknown as { page: number }).page).toBe(1);
    expect(pageControl(root, 1).getAttribute("aria-current")).toBe("page");
  });
});

describe("idg-pagination as links", () => {
  const links = <idg-pagination pageCount={5} page={2} hrefTemplate="/items?page={page}" />;

  it("draws links whose addresses come from the template", async () => {
    const { root } = await render(links);
    expect(controls(root).map((control) => control.getAttribute("href"))).toEqual([
      "/items?page=1",
      "/items?page=1",
      "/items?page=2",
      "/items?page=3",
      "/items?page=4",
      "/items?page=5",
      "/items?page=3",
    ]);
  });

  it("draws previous on the first page and next on the last as links that are not available", async () => {
    const first = await render(<idg-pagination pageCount={3} page={1} hrefTemplate="/p/{page}" />);
    const previous = part(first.root, "previous");
    expect(previous.localName).toBe("a");
    expect(previous.hasAttribute("href")).toBe(false);
    expect(previous.getAttribute("role")).toBe("link");
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    const last = await render(<idg-pagination pageCount={3} page={3} hrefTemplate="/p/{page}" />);
    expect(part(last.root, "next").getAttribute("aria-disabled")).toBe("true");
  });

  it("falls back to buttons for a template that is unsafe or has no placeholder", async () => {
    for (const template of ["javascript:alert({page})", "/items"]) {
      const { root } = await render(
        <idg-pagination pageCount={3} page={2} hrefTemplate={template} />,
      );
      expect(controls(root).every((control) => control.localName === "button")).toBe(true);
    }
  });

  it("marks the current page on its link", async () => {
    const { root } = await render(links);
    expect(pageControl(root, 2).getAttribute("aria-current")).toBe("page");
  });

  it("emits idgPageChange when a link is clicked, leaving the link to be followed", async () => {
    const { root, spyOnEvent } = await render(links);
    const spy = spyOnEvent("idgPageChange");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    pageControl(root, 4).dispatchEvent(click);
    expect(spy.lastEvent?.detail).toEqual({ page: 4 });
    expect(click.defaultPrevented).toBe(false);
  });

  it("stops the link being followed when the event is cancelled", async () => {
    const { root } = await render(links);
    root.addEventListener("idgPageChange", (event) => {
      event.preventDefault();
    });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    pageControl(root, 4).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it("leaves a click with a modifier key to the browser, which opens the page elsewhere", async () => {
    const { root, spyOnEvent } = await render(links);
    const spy = spyOnEvent("idgPageChange");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    pageControl(root, 4).dispatchEvent(click);
    expect(spy.length).toBe(0);
    expect(click.defaultPrevented).toBe(false);
  });

  it("does nothing for a link that is not available", async () => {
    const { root, spyOnEvent } = await render(
      <idg-pagination pageCount={3} page={1} hrefTemplate="/p/{page}" />,
    );
    const spy = spyOnEvent("idgPageChange");
    part(root, "previous").click();
    expect(spy.length).toBe(0);
  });
});

describe("idg-pagination focus", () => {
  it("moves focus to the current page when the control that was used becomes unavailable", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const { root, waitForChanges } = await render(<idg-pagination pageCount={3} page={2} />);
    part(root, "next").click();
    await waitForChanges();
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });
});
