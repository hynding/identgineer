import { beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installPopoverElement } from "../../testing/popover-element";
import "./popover";

interface PopoverHost extends HTMLElement {
  open: boolean;
  show: () => Promise<void>;
  hide: () => Promise<void>;
  toggle: () => Promise<void>;
}

interface AriaTrigger extends HTMLElement {
  ariaExpanded: string | null;
  ariaControlsElements: Element[] | null;
}

let popover: ReturnType<typeof installPopoverElement>;

beforeEach(() => {
  popover = installPopoverElement();
});

function surface(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="surface"]');
  if (!element) throw new Error("idg-popover rendered no surface");
  return element;
}

function trigger(root: HTMLElement): AriaTrigger {
  const element = root.querySelector<AriaTrigger>('[slot="trigger"]');
  if (!element) throw new Error("no trigger");
  return element;
}

const basic = (
  <idg-popover>
    <button slot="trigger">Share</button>
    <p>Anyone with the link can view.</p>
  </idg-popover>
);

describe("idg-popover rendering", () => {
  it("renders an auto popover around the default slot, with the trigger outside it", async () => {
    const { root } = await render(basic);
    const element = surface(root);
    expect(element.getAttribute("popover")).toBe("auto");
    expect(element.querySelector("slot:not([name])")).not.toBeNull();
    expect(element.querySelector('slot[name="trigger"]')).toBeNull();
    expect(root.shadowRoot?.querySelector('slot[name="trigger"]')).not.toBeNull();
  });

  it("places the surface bottom-start by default and falls back to it", async () => {
    const { root } = await render(basic);
    expect(surface(root).classList.contains("placement-bottom-start")).toBe(true);
    const odd = await render(
      <idg-popover placement={"sideways" as "top"}>
        <button slot="trigger">A</button>
      </idg-popover>,
    );
    expect(surface(odd.root).classList.contains("placement-bottom-start")).toBe(true);
  });

  it.each(["top", "right-end", "left-start"] as const)(
    "applies placement %s",
    async (placement) => {
      const { root } = await render(
        <idg-popover placement={placement}>
          <button slot="trigger">A</button>
        </idg-popover>,
      );
      expect(surface(root).classList.contains(`placement-${placement}`)).toBe(true);
    },
  );
});

describe("idg-popover trigger", () => {
  it("tells the trigger it controls the popover and is collapsed", async () => {
    const { root } = await render(basic);
    expect(trigger(root).ariaExpanded).toBe("false");
    expect(trigger(root).ariaControlsElements).toEqual([root]);
  });

  it("opens and closes on a click of the trigger", async () => {
    const { root, waitForChanges } = await render(basic);
    trigger(root).click();
    await waitForChanges();
    expect(popover.showPopover).toHaveBeenCalledTimes(1);
    expect(root.hasAttribute("open")).toBe(true);
    expect(trigger(root).ariaExpanded).toBe("true");
    trigger(root).click();
    await waitForChanges();
    expect(root.hasAttribute("open")).toBe(false);
    expect(trigger(root).ariaExpanded).toBe("false");
  });

  it("hands the state to an idg-* trigger through its properties", async () => {
    const { root, waitForChanges } = await render(
      <idg-popover>
        <idg-button slot="trigger">Share</idg-button>
      </idg-popover>,
    );
    const button = root.querySelector('[slot="trigger"]') as HTMLElement & {
      accessibleExpanded?: boolean;
      accessibleControls?: Element[];
    };
    expect(button.accessibleExpanded).toBe(false);
    expect(button.accessibleControls).toEqual([root]);
    await (root as PopoverHost).show();
    await waitForChanges();
    expect(button.accessibleExpanded).toBe(true);
  });

  it("uses the element named by for, looked up by id", async () => {
    const { root, waitForChanges } = await render(
      <div>
        <button id="details-trigger">Details</button>
        <idg-popover for="details-trigger">Created by Ada</idg-popover>
      </div>,
    );
    const button = root.querySelector("#details-trigger") as AriaTrigger;
    expect(button.ariaExpanded).toBe("false");
    button.click();
    await waitForChanges();
    expect(root.querySelector("idg-popover")?.hasAttribute("open")).toBe(true);
  });

  it("never builds a selector from for", async () => {
    const { root } = await render(
      <div>
        <button id="x">X</button>
        <idg-popover for={'x"], *, [id="'}>Body</idg-popover>
      </div>,
    );
    expect((root.querySelector("#x") as AriaTrigger).ariaExpanded).toBeFalsy();
  });

  it("clears what it set on the trigger when it is removed", async () => {
    const { root } = await render(
      <div>
        <button id="t">T</button>
        <idg-popover for="t">Body</idg-popover>
      </div>,
    );
    root.querySelector("idg-popover")?.remove();
    const button = root.querySelector("#t") as AriaTrigger;
    expect(button.ariaExpanded).toBeNull();
    expect(button.ariaControlsElements).toBeNull();
  });
});

describe("idg-popover open state", () => {
  it("opens when open is set and emits idgOpen", async () => {
    const opened = vi.fn();
    const { root, waitForChanges } = await render(basic);
    root.addEventListener("idgOpen", opened);
    (root as PopoverHost).open = true;
    await waitForChanges();
    expect(popover.showPopover).toHaveBeenCalled();
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("closes through hide() and emits idgClose", async () => {
    const closed = vi.fn();
    const { root, waitForChanges } = await render(basic);
    root.addEventListener("idgClose", closed);
    await (root as PopoverHost).show();
    await (root as PopoverHost).hide();
    await waitForChanges();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(root.hasAttribute("open")).toBe(false);
  });

  it("closes on Escape inside the surface", async () => {
    const { root, waitForChanges } = await render(basic);
    await (root as PopoverHost).show();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    surface(root).dispatchEvent(event);
    await waitForChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(root.hasAttribute("open")).toBe(false);
  });

  it("follows a close it did not start, such as light dismiss", async () => {
    const { root, waitForChanges } = await render(basic);
    await (root as PopoverHost).show();
    surface(root).hidePopover();
    await waitForChanges();
    expect(root.hasAttribute("open")).toBe(false);
    expect(trigger(root).ariaExpanded).toBe("false");
  });
});
