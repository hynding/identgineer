import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./tab";

describe("idg-tab", () => {
  it("is a tab, and is selected only when it says so", async () => {
    const { root } = await render(<idg-tab value="a">A</idg-tab>);
    expect(root.getAttribute("role")).toBe("tab");
    expect(root.getAttribute("aria-selected")).toBe("false");
  });

  it("reports selection", async () => {
    const { root } = await render(
      <idg-tab value="a" selected>
        A
      </idg-tab>,
    );
    expect(root.getAttribute("aria-selected")).toBe("true");
  });

  it("is a tab stop only when it is the list's one tab stop", async () => {
    const stop = await render(
      <idg-tab value="a" selected tabbable>
        A
      </idg-tab>,
    );
    expect(stop.root.getAttribute("tabindex")).toBe("0");
    const other = await render(<idg-tab value="b">B</idg-tab>);
    expect(other.root.getAttribute("tabindex")).toBe("-1");
  });

  it("is announced as unavailable when disabled, and cannot be a tab stop", async () => {
    const { root } = await render(
      <idg-tab value="a" disabled tabbable>
        A
      </idg-tab>,
    );
    expect(root.getAttribute("aria-disabled")).toBe("true");
    expect(root.getAttribute("tabindex")).toBe("-1");
  });

  it("draws its label in a part", async () => {
    const { root } = await render(<idg-tab value="a">A</idg-tab>);
    expect(root.shadowRoot?.querySelector('[part="tab"] slot')).not.toBeNull();
  });
});
