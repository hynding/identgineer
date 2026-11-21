import { afterEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { removeHost } from "../../testing/remove-host";
import "./accordion-item";

afterEach(() => {
  vi.restoreAllMocks();
});

interface ItemElement extends HTMLElement {
  open: boolean;
  disabled: boolean;
  setFocus: () => Promise<void>;
}

function part(root: HTMLElement, name: string): HTMLElement {
  const found = root.shadowRoot?.querySelector<HTMLElement>(`[part~="${name}"]`);
  if (!found) throw new Error(`no ${name} part`);
  return found;
}

describe("idg-accordion-item rendering", () => {
  it("puts a button in a level 3 heading", async () => {
    const { root } = await render(<idg-accordion-item heading="Shipping">Body</idg-accordion-item>);
    const heading = part(root, "heading");
    expect(heading.localName).toBe("h3");
    expect(heading.querySelector("button")).toBe(part(root, "trigger"));
    expect(part(root, "trigger").getAttribute("type")).toBe("button");
  });

  it.each([1, 2, 4, 5, 6])("draws a level %i heading when asked", async (level) => {
    const { root } = await render(
      <idg-accordion-item heading="Shipping" headingLevel={level}>
        Body
      </idg-accordion-item>,
    );
    expect(part(root, "heading").localName).toBe(`h${String(level)}`);
  });

  it("uses level 3 for a level that does not exist", async () => {
    const { root } = await render(
      <idg-accordion-item heading="Shipping" headingLevel={9}>
        Body
      </idg-accordion-item>,
    );
    expect(part(root, "heading").localName).toBe("h3");
  });

  it("shows the heading text, or a heading slot in its place", async () => {
    const { root } = await render(<idg-accordion-item heading="Shipping">Body</idg-accordion-item>);
    expect(part(root, "title").textContent).toContain("Shipping");
    expect(part(root, "title").querySelector('slot[name="heading"]')).not.toBeNull();
  });

  it("draws a chevron as decoration", async () => {
    const { root } = await render(<idg-accordion-item heading="Shipping">Body</idg-accordion-item>);
    const chevron = part(root, "chevron");
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
  });

  it("reports whether it is open, and says which panel the button controls", async () => {
    const closed = await render(<idg-accordion-item heading="Shipping">Body</idg-accordion-item>);
    expect(part(closed.root, "trigger").getAttribute("aria-expanded")).toBe("false");
    const open = await render(
      <idg-accordion-item heading="Shipping" open>
        Body
      </idg-accordion-item>,
    );
    const trigger = part(open.root, "trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panelId = trigger.getAttribute("aria-controls") ?? "";
    expect(open.root.shadowRoot?.getElementById(panelId)).toBe(part(open.root, "panel"));
  });

  it("makes an open panel a region named by its button when it is asked to", async () => {
    const { root } = await render(
      <idg-accordion-item heading="Shipping" open>
        Body
      </idg-accordion-item>,
    );
    const panel = part(root, "panel");
    expect(panel.getAttribute("role")).toBe("region");
    const labelId = panel.getAttribute("aria-labelledby") ?? "";
    expect(root.shadowRoot?.getElementById(labelId)).toBe(part(root, "trigger"));
  });

  it("leaves a closed panel out of the landmarks, even when it can be found by the browser", async () => {
    const { root, waitForChanges } = await render(
      <idg-accordion-item heading="Shipping" findInPage>
        Body
      </idg-accordion-item>,
    );
    const panel = part(root, "panel");
    expect(panel.getAttribute("hidden")).toBe("until-found");
    expect(panel.hasAttribute("role")).toBe(false);
    expect(panel.hasAttribute("aria-labelledby")).toBe(false);
    (root as ItemElement).open = true;
    await waitForChanges();
    expect(panel.getAttribute("role")).toBe("region");
    (root as ItemElement).open = false;
    await waitForChanges();
    expect(panel.hasAttribute("role")).toBe(false);
  });

  it("leaves the panel plain when the accordion has too many items for regions", async () => {
    const { root } = await render(
      <idg-accordion-item heading="Shipping" hasRegion={false}>
        Body
      </idg-accordion-item>,
    );
    expect(part(root, "panel").hasAttribute("role")).toBe(false);
    expect(part(root, "panel").hasAttribute("aria-labelledby")).toBe(false);
  });

  it("hides a closed panel and shows an open one", async () => {
    const closed = await render(<idg-accordion-item heading="Shipping">Body</idg-accordion-item>);
    expect(part(closed.root, "panel").hasAttribute("hidden")).toBe(true);
    const open = await render(
      <idg-accordion-item heading="Shipping" open>
        Body
      </idg-accordion-item>,
    );
    expect(part(open.root, "panel").hasAttribute("hidden")).toBe(false);
  });

  it("hides a closed panel until found when the browser may find it", async () => {
    const { root, waitForChanges } = await render(
      <idg-accordion-item heading="Shipping" findInPage>
        Body
      </idg-accordion-item>,
    );
    expect(part(root, "panel").getAttribute("hidden")).toBe("until-found");
    (root as ItemElement).open = true;
    await waitForChanges();
    expect(part(root, "panel").hasAttribute("hidden")).toBe(false);
    (root as ItemElement).open = false;
    await waitForChanges();
    expect(part(root, "panel").getAttribute("hidden")).toBe("until-found");
  });

  it("does not let a disabled item be found, since it cannot be opened", async () => {
    const { root } = await render(
      <idg-accordion-item heading="Shipping" findInPage disabled>
        Body
      </idg-accordion-item>,
    );
    expect(part(root, "panel").getAttribute("hidden")).toBe("");
  });

  it("disables the button of a disabled item", async () => {
    const { root } = await render(
      <idg-accordion-item heading="Shipping" disabled>
        Body
      </idg-accordion-item>,
    );
    expect(part(root, "trigger").hasAttribute("disabled")).toBe(true);
  });
});

describe("idg-accordion-item opening", () => {
  it("opens and closes with its button and reports each change", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-accordion-item heading="Shipping" value="shipping">
        Body
      </idg-accordion-item>,
    );
    const spy = spyOnEvent("idgToggle");
    part(root, "trigger").click();
    await waitForChanges();
    expect((root as ItemElement).open).toBe(true);
    expect(part(root, "trigger").getAttribute("aria-expanded")).toBe("true");
    part(root, "trigger").click();
    await waitForChanges();
    expect((root as ItemElement).open).toBe(false);
    expect(spy.events.map((event) => event.detail)).toEqual([
      { value: "shipping", open: true },
      { value: "shipping", open: false },
    ]);
  });

  it("reports a change a script made", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-accordion-item heading="Shipping" value="shipping">
        Body
      </idg-accordion-item>,
    );
    const spy = spyOnEvent("idgToggle");
    (root as ItemElement).open = true;
    await waitForChanges();
    expect(spy.lastEvent?.detail).toEqual({ value: "shipping", open: true });
  });

  it("does not open when disabled", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-accordion-item heading="Shipping" disabled>
        Body
      </idg-accordion-item>,
    );
    const spy = spyOnEvent("idgToggle");
    part(root, "trigger").click();
    await waitForChanges();
    expect((root as ItemElement).open).toBe(false);
    expect(spy.length).toBe(0);
  });

  it("opens when the browser finds text in its hidden panel", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-accordion-item heading="Shipping" value="shipping" findInPage>
        Body
      </idg-accordion-item>,
    );
    const spy = spyOnEvent("idgToggle");
    part(root, "panel").dispatchEvent(new Event("beforematch", { bubbles: true }));
    await waitForChanges();
    expect((root as ItemElement).open).toBe(true);
    expect(spy.lastEvent?.detail).toEqual({ value: "shipping", open: true });
  });

  it("focuses its button", async () => {
    const { root } = await render(<idg-accordion-item heading="Shipping">Body</idg-accordion-item>);
    const focus = vi.spyOn(part(root, "trigger"), "focus");
    await (root as ItemElement).setFocus();
    expect(focus).toHaveBeenCalled();
  });

  it("stops listening for a find while out of the page, and listens again when put back", async () => {
    const { root, waitForChanges } = await render(
      <div>
        <idg-accordion-item heading="Shipping" findInPage>
          Body
        </idg-accordion-item>
      </div>,
    );
    const item = root.querySelector("idg-accordion-item") as ItemElement;
    const panel = part(item, "panel");
    const remove = vi.spyOn(panel, "removeEventListener");
    const add = vi.spyOn(panel, "addEventListener");
    removeHost(item);
    expect(remove).toHaveBeenCalledWith("beforematch", expect.any(Function));
    root.append(item);
    await waitForChanges();
    expect(add).toHaveBeenCalledWith("beforematch", expect.any(Function));
    panel.dispatchEvent(new Event("beforematch"));
    await waitForChanges();
    expect(item.open).toBe(true);
  });
});
