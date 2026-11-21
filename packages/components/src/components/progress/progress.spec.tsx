import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./progress";

function native(root: HTMLElement): HTMLProgressElement {
  const element = root.shadowRoot?.querySelector<HTMLProgressElement>("progress");
  if (!element) throw new Error("idg-progress rendered no native progress");
  return element;
}

describe("idg-progress determinate", () => {
  it("renders a native progress with its value and maximum", async () => {
    const { root } = await render(<idg-progress label="Upload" value={40} max={80} />);
    const element = native(root);
    expect(element.getAttribute("value")).toBe("40");
    expect(element.getAttribute("max")).toBe("80");
    expect(element.getAttribute("part")).toBe("control");
  });

  it("is out of 100 by default", async () => {
    const { root } = await render(<idg-progress label="Upload" value={40} />);
    expect(native(root).getAttribute("max")).toBe("100");
  });

  it("names the native element after the label and shows the label", async () => {
    const { root } = await render(<idg-progress label="Upload" value={40} />);
    expect(native(root).getAttribute("aria-label")).toBe("Upload");
    expect(root.shadowRoot?.querySelector('[part="label"]')?.textContent).toBe("Upload");
  });

  it.each([
    [-5, "0"],
    [140, "100"],
    [12.5, "12.5"],
  ])("keeps a value of %s inside the range, as %s", async (value, expected) => {
    const { root } = await render(<idg-progress label="Upload" value={value} />);
    expect(native(root).getAttribute("value")).toBe(expected);
  });

  it("falls back to 100 for a maximum that is not positive", async () => {
    const { root } = await render(<idg-progress label="Upload" value={5} max={0} />);
    expect(native(root).getAttribute("max")).toBe("100");
  });

  it("shows the percentage on request, hidden from assistive technology", async () => {
    const { root } = await render(<idg-progress label="Upload" value={40} max={80} show-value />);
    const text = root.shadowRoot?.querySelector('[part="value"]');
    expect(text?.textContent).toBe("50%");
    expect(text?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows no percentage by default", async () => {
    const { root } = await render(<idg-progress label="Upload" value={40} />);
    expect(root.shadowRoot?.querySelector('[part="value"]')).toBeNull();
  });
});

describe("idg-progress indeterminate", () => {
  it("has no value when the work has no known length", async () => {
    const { root } = await render(<idg-progress label="Working" indeterminate />);
    const element = native(root);
    expect(element.hasAttribute("value")).toBe(false);
    expect(element.getAttribute("max")).toBe("100");
  });

  it("is indeterminate when there is no value", async () => {
    const { root } = await render(<idg-progress label="Working" />);
    expect(native(root).hasAttribute("value")).toBe(false);
  });

  it("ignores a value while indeterminate and shows no percentage", async () => {
    const { root } = await render(
      <idg-progress label="Working" indeterminate value={30} show-value />,
    );
    expect(native(root).hasAttribute("value")).toBe(false);
    expect(root.shadowRoot?.querySelector('[part="value"]')).toBeNull();
  });
});

describe("idg-progress size", () => {
  it.each(["sm", "md", "lg"] as const)("applies size %s", async (size) => {
    const { root } = await render(<idg-progress label="Upload" value={1} size={size} />);
    expect(native(root).classList.contains(`size-${size}`)).toBe(true);
  });

  it("falls back to medium", async () => {
    const { root } = await render(<idg-progress label="Upload" value={1} size={"huge" as "md"} />);
    expect(native(root).classList.contains("size-md")).toBe(true);
  });
});
