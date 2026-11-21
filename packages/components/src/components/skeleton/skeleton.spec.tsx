import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./skeleton";

function shapes(root: HTMLElement): HTMLElement[] {
  return [...(root.shadowRoot?.querySelectorAll<HTMLElement>('[part="shape"]') ?? [])];
}

describe("idg-skeleton", () => {
  it("is a text line by default", async () => {
    const { root } = await render(<idg-skeleton />);
    expect(shapes(root)).toHaveLength(1);
    expect(shapes(root)[0]?.classList.contains("variant-text")).toBe(true);
  });

  it.each(["text", "rect", "circle"] as const)("applies variant %s", async (variant) => {
    const { root } = await render(<idg-skeleton variant={variant} />);
    expect(shapes(root)[0]?.classList.contains(`variant-${variant}`)).toBe(true);
    expect(root.getAttribute("variant")).toBe(variant);
  });

  it("falls back to text for a variant it does not know", async () => {
    const { root } = await render(<idg-skeleton variant={"blob" as "text"} />);
    expect(shapes(root)[0]?.classList.contains("variant-text")).toBe(true);
  });

  it("is hidden from assistive technology, which a loading region announces instead", async () => {
    const { root } = await render(<idg-skeleton variant="rect" />);
    expect(root.shadowRoot?.querySelector(".skeleton")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws several lines of text, the last one shorter", async () => {
    const { root } = await render(<idg-skeleton lines={3} />);
    const lines = shapes(root);
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.classList.contains("last"))).toEqual([false, false, true]);
  });

  it("draws one line when it has one", async () => {
    const { root } = await render(<idg-skeleton lines={1} />);
    expect(shapes(root)[0]?.classList.contains("last")).toBe(false);
  });

  it.each([0, -2, 2.5, 99])("draws a sensible number of lines for %s", async (lines) => {
    const { root } = await render(<idg-skeleton lines={lines} />);
    expect(shapes(root).length).toBeGreaterThanOrEqual(1);
    expect(shapes(root).length).toBeLessThanOrEqual(10);
  });

  it("ignores lines for the shapes that are not text", async () => {
    const { root } = await render(<idg-skeleton variant="circle" lines={4} />);
    expect(shapes(root)).toHaveLength(1);
  });

  it("carries no inline style, so its size is set by the page's own stylesheet", async () => {
    const { root } = await render(<idg-skeleton variant="rect" />);
    expect(root.shadowRoot?.querySelector("[style]")).toBeNull();
  });
});
