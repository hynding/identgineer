import { describe, expect, it, vi } from "vitest";
import { Build } from "@stencil/core";
import { h, render } from "@stencil/vitest";
import "./icon";

function svg(root: HTMLElement): SVGElement {
  const element = root.shadowRoot?.querySelector<SVGElement>("svg");
  if (!element) throw new Error("idg-icon rendered no svg");
  return element;
}

describe("idg-icon rendering", () => {
  it("draws the named icon as svg paths on a 24px grid", async () => {
    const { root } = await render(<idg-icon name="check" />);
    const drawing = svg(root);
    expect(drawing.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(drawing.getAttribute("fill")).toBe("none");
    expect(drawing.getAttribute("stroke")).toBe("currentcolor");
    expect(drawing.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(drawing.querySelector("path")?.getAttribute("d")).toMatch(/^M/);
  });

  it("draws different shapes for different names", async () => {
    const check = await render(<idg-icon name="check" />);
    const close = await render(<idg-icon name="close" />);
    expect(svg(check.root).innerHTML).not.toBe(svg(close.root).innerHTML);
  });

  it("is hidden from assistive technology without a label", async () => {
    const { root } = await render(<idg-icon name="search" />);
    const drawing = svg(root);
    expect(drawing.getAttribute("aria-hidden")).toBe("true");
    expect(drawing.getAttribute("focusable")).toBe("false");
    expect(drawing.hasAttribute("role")).toBe(false);
    expect(drawing.hasAttribute("aria-label")).toBe(false);
  });

  it("becomes an image with an accessible name when it has a label", async () => {
    const { root } = await render(<idg-icon name="search" label="Search" />);
    const drawing = svg(root);
    expect(drawing.getAttribute("role")).toBe("img");
    expect(drawing.getAttribute("aria-label")).toBe("Search");
    expect(drawing.hasAttribute("aria-hidden")).toBe(false);
  });

  it("treats an empty label as no label", async () => {
    const { root } = await render(<idg-icon name="search" label="" />);
    expect(svg(root).getAttribute("aria-hidden")).toBe("true");
  });

  it.each(["sm", "md", "lg", "xl"] as const)("applies size %s", async (size) => {
    const { root } = await render(<idg-icon name="check" size={size} />);
    expect(svg(root).classList.contains(`size-${size}`)).toBe(true);
    expect(root.getAttribute("size")).toBe(size);
  });

  it("falls back to the medium size for a value it does not know", async () => {
    const { root } = await render(<idg-icon name="check" size={"huge" as "md"} />);
    expect(svg(root).classList.contains("size-md")).toBe(true);
  });
});

describe("idg-icon with a name it does not have", () => {
  it("renders nothing", async () => {
    const { root } = await render(<idg-icon name={"no-such-icon" as "check"} />);
    expect(root.shadowRoot?.querySelector("svg")).toBeNull();
  });

  it("renders nothing without a name", async () => {
    const { root } = await render(<idg-icon />);
    expect(root.shadowRoot?.querySelector("svg")).toBeNull();
  });

  it("warns once per name in development", async () => {
    // The specs compile in production mode; the warning is for development builds.
    const development = Build.isDev;
    Build.isDev = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await render(<idg-icon name={"missing-one" as "check"} />);
      await render(<idg-icon name={"missing-one" as "check"} />);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("missing-one");
      await render(<idg-icon name={"missing-two" as "check"} />);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      Build.isDev = development;
      warn.mockRestore();
    }
  });
});
