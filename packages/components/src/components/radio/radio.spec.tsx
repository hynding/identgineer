import { describe, expect, it } from "vitest";
import { h } from "@stencil/vitest";
import { renderControl as render } from "../../testing/form-internals";
import "./radio";

function native(root: HTMLElement): HTMLInputElement {
  const element = root.shadowRoot?.querySelector<HTMLInputElement>("input");
  if (!element) throw new Error("idg-radio rendered no input");
  return element;
}

describe("idg-radio", () => {
  it("renders a native radio inside a label that holds the default slot", async () => {
    const { root } = await render(<idg-radio value="a">Alpha</idg-radio>);
    expect(native(root).getAttribute("type")).toBe("radio");
    expect(native(root).getAttribute("part")).toBe("control");
    expect(root.shadowRoot?.querySelector("label")?.contains(native(root))).toBe(true);
  });

  it("reflects checked and disabled", async () => {
    const { root } = await render(
      <idg-radio value="a" checked disabled>
        Alpha
      </idg-radio>,
    );
    expect(native(root).checked).toBe(true);
    expect(native(root).hasAttribute("disabled")).toBe(true);
  });

  it("is also disabled when its group is", async () => {
    const { root } = await render(
      <idg-radio value="a" groupDisabled>
        Alpha
      </idg-radio>,
    );
    expect(native(root).hasAttribute("disabled")).toBe(true);
  });

  it("is in the tab order unless the group takes it out", async () => {
    const free = await render(<idg-radio value="a">A</idg-radio>);
    expect(native(free.root).getAttribute("tabindex")).toBe("0");
    const roving = await render(
      <idg-radio value="a" tabbable={false}>
        A
      </idg-radio>,
    );
    expect(native(roving.root).getAttribute("tabindex")).toBe("-1");
  });

  it("states its place in the group, which separate shadow roots cannot work out", async () => {
    const { root } = await render(
      <idg-radio value="a" position={2} setSize={5}>
        A
      </idg-radio>,
    );
    expect(native(root).getAttribute("aria-posinset")).toBe("2");
    expect(native(root).getAttribute("aria-setsize")).toBe("5");
  });

  it("marks the invalid state", async () => {
    const { root } = await render(
      <idg-radio value="a" invalid>
        A
      </idg-radio>,
    );
    expect(native(root).getAttribute("aria-invalid")).toBe("true");
  });

  it("announces its choice to the group with idgSelect", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<idg-radio value="a">A</idg-radio>);
    const spy = spyOnEvent("idgSelect");
    native(root).checked = true;
    native(root).dispatchEvent(new Event("change", { bubbles: true }));
    await waitForChanges();
    expect(spy.lastEvent?.detail).toEqual({ value: "a" });
    expect((root as unknown as { checked: boolean }).checked).toBe(true);
  });

  it("focuses its native input", async () => {
    const { root } = await render(<idg-radio value="a">A</idg-radio>);
    let focused = false;
    native(root).focus = () => {
      focused = true;
    };
    await (root as unknown as { setFocus: () => Promise<void> }).setFocus();
    expect(focused).toBe(true);
  });
});
