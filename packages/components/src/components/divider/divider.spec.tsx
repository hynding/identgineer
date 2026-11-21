import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./divider";

function line(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('hr[part="line"]');
  if (!element) throw new Error("idg-divider rendered no line");
  return element;
}

describe("idg-divider", () => {
  it("is a native horizontal separator by default", async () => {
    const { root } = await render(<idg-divider />);
    const element = line(root);
    expect(element.hasAttribute("role")).toBe(false);
    expect(element.hasAttribute("aria-orientation")).toBe(false);
    expect(element.classList.contains("horizontal")).toBe(true);
  });

  it("says so when it is vertical", async () => {
    const { root } = await render(<idg-divider orientation="vertical" />);
    expect(line(root).getAttribute("aria-orientation")).toBe("vertical");
    expect(line(root).classList.contains("vertical")).toBe(true);
    expect(root.getAttribute("orientation")).toBe("vertical");
  });

  it("falls back to horizontal for a value it does not know", async () => {
    const { root } = await render(<idg-divider orientation={"diagonal" as "vertical"} />);
    expect(line(root).classList.contains("horizontal")).toBe(true);
  });

  it("leaves the accessibility tree when it is only decoration", async () => {
    const { root } = await render(<idg-divider decorative />);
    expect(line(root).getAttribute("role")).toBe("presentation");
  });
});
