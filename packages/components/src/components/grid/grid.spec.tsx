import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./grid";

function part(root: HTMLElement, name: string): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>(`[part="${name}"]`);
  if (!element) throw new Error(`no ${name} part`);
  return element;
}

/** Layout primitives only arrange: nothing they draw may add a role, a name or an inline style. */
function expectPresentational(root: HTMLElement): void {
  expect(root.hasAttribute("role")).toBe(false);
  for (const element of Array.from(root.shadowRoot?.querySelectorAll("*") ?? [])) {
    expect(element.hasAttribute("role"), element.outerHTML).toBe(false);
    expect(element.hasAttribute("tabindex"), element.outerHTML).toBe(false);
    expect(element.hasAttribute("style"), element.outerHTML).toBe(false);
    expect(
      Array.from(element.attributes).some((attribute) => attribute.name.startsWith("aria-")),
      element.outerHTML,
    ).toBe(false);
  }
}

function gapClasses(element: HTMLElement): string[] {
  return element.className.split(" ").filter((name) => name.startsWith("gap-"));
}

function sizeClasses(element: HTMLElement): string[] {
  return element.className.split(" ").filter((name) => name.startsWith("size-"));
}

describe("idg-grid", () => {
  it("takes its track minimum and gap from the layout by default", async () => {
    const { root } = await render(<idg-grid>Item</idg-grid>);
    const grid = part(root, "grid");
    expect(sizeClasses(grid)).toEqual([]);
    expect(gapClasses(grid)).toEqual([]);
    expect(grid.querySelector("slot:not([name])")).not.toBeNull();
  });

  it.each(["xs", "s", "m", "l", "xl", "2xl"] as const)("applies min %s", async (min) => {
    const { root } = await render(<idg-grid min={min}>Item</idg-grid>);
    expect(sizeClasses(part(root, "grid"))).toEqual([`size-${min}`]);
    expect(root.getAttribute("min")).toBe(min);
  });

  it.each(["none", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl"] as const)(
    "applies gap %s",
    async (gap) => {
      const { root } = await render(<idg-grid gap={gap}>Item</idg-grid>);
      expect(gapClasses(part(root, "grid"))).toEqual([`gap-${gap}`]);
    },
  );

  it.each(["20rem", "screen", "huge", "0", "calc(1px)"])(
    "falls back to the layout's track minimum for %j",
    async (min) => {
      const { root } = await render(<idg-grid min={min as "m"}>Item</idg-grid>);
      expect(sizeClasses(part(root, "grid"))).toEqual([]);
    },
  );

  it("falls back to the layout's gap for a gap it does not know", async () => {
    const { root } = await render(<idg-grid gap={"wide" as "m"}>Item</idg-grid>);
    expect(gapClasses(part(root, "grid"))).toEqual([]);
  });

  it("adds no role, name, tab stop or inline style", async () => {
    const { root } = await render(
      <idg-grid min="s" gap="l">
        Item
      </idg-grid>,
    );
    expectPresentational(root);
  });
});
