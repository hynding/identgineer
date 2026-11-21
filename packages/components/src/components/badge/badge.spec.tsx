import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./badge";

function badge(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="badge"]');
  if (!element) throw new Error("idg-badge rendered no badge part");
  return element;
}

describe("idg-badge rendering", () => {
  it("renders the slotted text in a neutral medium badge by default", async () => {
    const { root } = await render(<idg-badge>New</idg-badge>);
    const element = badge(root);
    expect(element.querySelector('[part="label"] slot:not([name])')).not.toBeNull();
    expect(element.classList.contains("variant-neutral")).toBe(true);
    expect(element.classList.contains("size-md")).toBe(true);
  });

  it.each(["neutral", "accent", "success", "warning", "danger", "info"] as const)(
    "applies variant %s",
    async (variant) => {
      const { root } = await render(<idg-badge variant={variant}>Label</idg-badge>);
      expect(badge(root).classList.contains(`variant-${variant}`)).toBe(true);
      expect(root.getAttribute("variant")).toBe(variant);
    },
  );

  it.each(["sm", "md"] as const)("applies size %s", async (size) => {
    const { root } = await render(<idg-badge size={size}>Label</idg-badge>);
    expect(badge(root).classList.contains(`size-${size}`)).toBe(true);
  });

  it("falls back to the defaults for values it does not know", async () => {
    const { root } = await render(
      <idg-badge variant={"loud" as "neutral"} size={"huge" as "md"}>
        Label
      </idg-badge>,
    );
    expect(badge(root).classList.contains("variant-neutral")).toBe(true);
    expect(badge(root).classList.contains("size-md")).toBe(true);
  });
});

describe("idg-badge dot", () => {
  it("shows a dot that assistive technology skips", async () => {
    const { root } = await render(<idg-badge dot>Online</idg-badge>);
    const dot = root.shadowRoot?.querySelector('[part="dot"]');
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows no dot unless asked", async () => {
    const { root } = await render(<idg-badge>Online</idg-badge>);
    expect(root.shadowRoot?.querySelector('[part="dot"]')).toBeNull();
  });
});
