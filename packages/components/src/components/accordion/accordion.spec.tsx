import { describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { removeHost } from "../../testing/remove-host";
import "../accordion-item/accordion-item";
import "./accordion";

interface ItemElement extends HTMLElement {
  open: boolean;
  headingLevel: number;
  hasRegion: boolean;
  findInPage: boolean;
}

const items = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<ItemElement>("idg-accordion-item"));
const opens = (root: HTMLElement) => items(root).map((item) => item.open);

function itemAt(root: HTMLElement, index: number): ItemElement {
  const found = items(root)[index];
  if (!found) throw new Error(`no item ${String(index)}`);
  return found;
}

function trigger(item: HTMLElement): HTMLButtonElement {
  const found = item.shadowRoot?.querySelector("button");
  if (!found) throw new Error("no trigger");
  return found;
}

function press(item: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  trigger(item).dispatchEvent(event);
  return event;
}

function spyFocus(root: HTMLElement) {
  return items(root).map((item) =>
    vi.spyOn(item as unknown as { setFocus: () => Promise<void> }, "setFocus").mockResolvedValue(),
  );
}

const faq = (
  <idg-accordion>
    <idg-accordion-item heading="Shipping" value="shipping">
      Ships in two days.
    </idg-accordion-item>
    <idg-accordion-item heading="Returns" value="returns" disabled>
      Thirty days.
    </idg-accordion-item>
    <idg-accordion-item heading="Warranty" value="warranty">
      One year.
    </idg-accordion-item>
    <idg-accordion-item heading="Contact" value="contact">
      Write to us.
    </idg-accordion-item>
  </idg-accordion>
);

describe("idg-accordion settings for its items", () => {
  it("gives every item the heading level, level 3 unless it is told otherwise", async () => {
    const plain = await render(faq);
    expect(items(plain.root).map((item) => item.headingLevel)).toEqual([3, 3, 3, 3]);
    const four = await render(
      <idg-accordion headingLevel={4}>
        <idg-accordion-item heading="A">A</idg-accordion-item>
      </idg-accordion>,
    );
    expect(items(four.root)[0]?.headingLevel).toBe(4);
  });

  it("follows a change of heading level", async () => {
    const { root, waitForChanges } = await render(faq);
    (root as unknown as { headingLevel: number }).headingLevel = 2;
    await waitForChanges();
    expect(items(root).map((item) => item.headingLevel)).toEqual([2, 2, 2, 2]);
  });

  it("tells the items whether a closed panel can be found", async () => {
    const { root } = await render(
      <idg-accordion findInPage>
        <idg-accordion-item heading="A">A</idg-accordion-item>
      </idg-accordion>,
    );
    expect(items(root)[0]?.findInPage).toBe(true);
  });

  it("makes the panels regions only while there are few enough items", async () => {
    const few = await render(faq);
    expect(items(few.root).every((item) => item.hasRegion)).toBe(true);
    const many = await render(
      <idg-accordion>
        {Array.from({ length: 7 }, (_, index) => (
          <idg-accordion-item heading={`Item ${String(index)}`}>Body</idg-accordion-item>
        ))}
      </idg-accordion>,
    );
    expect(items(many.root).some((item) => item.hasRegion)).toBe(false);
  });

  it("settles the region choice again when items are added", async () => {
    const { root, waitForChanges } = await render(faq);
    for (let index = 0; index < 3; index += 1) {
      const added = document.createElement("idg-accordion-item");
      added.setAttribute("heading", `More ${String(index)}`);
      root.append(added);
    }
    root.shadowRoot?.querySelector("slot")?.dispatchEvent(new Event("slotchange"));
    await waitForChanges();
    expect(items(root)).toHaveLength(7);
    expect(items(root).some((item) => item.hasRegion)).toBe(false);
    expect(items(root)[6]?.headingLevel).toBe(3);
  });
});

describe("idg-accordion single mode", () => {
  it("closes the open item when another opens", async () => {
    const { root, waitForChanges } = await render(faq);
    trigger(items(root)[0] as HTMLElement).click();
    await waitForChanges();
    expect(opens(root)).toEqual([true, false, false, false]);
    trigger(items(root)[2] as HTMLElement).click();
    await waitForChanges();
    expect(opens(root)).toEqual([false, false, true, false]);
  });

  it("lets the open item close, leaving none open", async () => {
    const { root, waitForChanges } = await render(faq);
    trigger(items(root)[0] as HTMLElement).click();
    await waitForChanges();
    trigger(items(root)[0] as HTMLElement).click();
    await waitForChanges();
    expect(opens(root)).toEqual([false, false, false, false]);
  });

  it("keeps only the first of the items marked open in the markup", async () => {
    const { root } = await render(
      <idg-accordion>
        <idg-accordion-item heading="A" open>
          A
        </idg-accordion-item>
        <idg-accordion-item heading="B" open>
          B
        </idg-accordion-item>
      </idg-accordion>,
    );
    expect(opens(root)).toEqual([true, false]);
  });

  it("closes the extra items when multiple is turned off", async () => {
    const { root, waitForChanges } = await render(
      <idg-accordion multiple>
        <idg-accordion-item heading="A" open>
          A
        </idg-accordion-item>
        <idg-accordion-item heading="B" open>
          B
        </idg-accordion-item>
      </idg-accordion>,
    );
    expect(opens(root)).toEqual([true, true]);
    (root as unknown as { multiple: boolean }).multiple = false;
    await waitForChanges();
    expect(opens(root)).toEqual([true, false]);
  });

  it("closes the others when a script opens an item", async () => {
    const { root, waitForChanges } = await render(faq);
    itemAt(root, 0).open = true;
    await waitForChanges();
    itemAt(root, 3).open = true;
    await waitForChanges();
    expect(opens(root)).toEqual([false, false, false, true]);
  });
});

describe("idg-accordion multiple mode", () => {
  it("lets several items stay open", async () => {
    const { root, waitForChanges } = await render(
      <idg-accordion multiple>
        <idg-accordion-item heading="A">A</idg-accordion-item>
        <idg-accordion-item heading="B">B</idg-accordion-item>
      </idg-accordion>,
    );
    trigger(items(root)[0] as HTMLElement).click();
    trigger(items(root)[1] as HTMLElement).click();
    await waitForChanges();
    expect(opens(root)).toEqual([true, true]);
  });
});

describe("idg-accordion keyboard", () => {
  it("moves to the next enabled header with ArrowDown, skipping a disabled one, and wraps", async () => {
    const { root } = await render(faq);
    const focus = spyFocus(root);
    expect(press(items(root)[0] as HTMLElement, "ArrowDown").defaultPrevented).toBe(true);
    expect(focus[2]).toHaveBeenCalledTimes(1);
    press(items(root)[3] as HTMLElement, "ArrowDown");
    expect(focus[0]).toHaveBeenCalledTimes(1);
  });

  it("moves to the previous header with ArrowUp, and wraps", async () => {
    const { root } = await render(faq);
    const focus = spyFocus(root);
    press(items(root)[2] as HTMLElement, "ArrowUp");
    expect(focus[0]).toHaveBeenCalledTimes(1);
    press(items(root)[0] as HTMLElement, "ArrowUp");
    expect(focus[3]).toHaveBeenCalledTimes(1);
  });

  it("goes to the first and last enabled header with Home and End", async () => {
    const { root } = await render(faq);
    const focus = spyFocus(root);
    press(items(root)[2] as HTMLElement, "Home");
    expect(focus[0]).toHaveBeenCalledTimes(1);
    press(items(root)[0] as HTMLElement, "End");
    expect(focus[3]).toHaveBeenCalledTimes(1);
  });

  it("leaves the horizontal arrows, other keys and modified keys alone", async () => {
    const { root } = await render(faq);
    const focus = spyFocus(root);
    expect(press(items(root)[0] as HTMLElement, "ArrowRight").defaultPrevented).toBe(false);
    expect(press(items(root)[0] as HTMLElement, "a").defaultPrevented).toBe(false);
    expect(
      press(items(root)[0] as HTMLElement, "ArrowDown", { altKey: true }).defaultPrevented,
    ).toBe(false);
    expect(focus.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });

  it("ignores keys pressed in a panel", async () => {
    const { root } = await render(
      <idg-accordion>
        <idg-accordion-item heading="A" open>
          <input id="field" />
        </idg-accordion-item>
        <idg-accordion-item heading="B">B</idg-accordion-item>
      </idg-accordion>,
    );
    spyFocus(root);
    const field = root.querySelector("#field");
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    field?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("idg-accordion moved in the page", () => {
  it("picks up items that changed while it was out of the page", async () => {
    const { root, waitForChanges } = await render(<div>{faq}</div>);
    const accordion = root.querySelector<HTMLElement>("idg-accordion");
    if (!accordion) throw new Error("no accordion");
    (accordion as unknown as { headingLevel: number }).headingLevel = 5;
    removeHost(accordion);
    const added = document.createElement("idg-accordion-item");
    added.setAttribute("heading", "Late");
    accordion.append(added);
    root.append(accordion);
    await waitForChanges();
    expect((added as ItemElement).headingLevel).toBe(5);
  });
});
