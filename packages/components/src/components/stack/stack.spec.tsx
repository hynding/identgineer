import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./stack";

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
  return Array.from(element.classList).filter((name) => name.startsWith("gap-"));
}

describe("idg-stack", () => {
  it("stretches its children and takes the layout's gap by default", async () => {
    const { root } = await render(<idg-stack>Item</idg-stack>);
    const stack = part(root, "stack");
    expect(stack.classList.contains("align-stretch")).toBe(true);
    expect(stack.classList.contains("dividers")).toBe(false);
    expect(gapClasses(stack)).toEqual([]);
    expect(stack.querySelector("slot:not([name])")).not.toBeNull();
  });

  it.each(["none", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl"] as const)(
    "applies gap %s",
    async (gap) => {
      const { root } = await render(<idg-stack gap={gap}>Item</idg-stack>);
      expect(gapClasses(part(root, "stack"))).toEqual([`gap-${gap}`]);
      expect(root.getAttribute("gap")).toBe(gap);
    },
  );

  it.each(["huge", "12px", "var(--x)", "calc(1px)", "M", ""])(
    "falls back to the layout's gap for %j",
    async (gap) => {
      const { root } = await render(<idg-stack gap={gap as "m"}>Item</idg-stack>);
      expect(gapClasses(part(root, "stack"))).toEqual([]);
    },
  );

  it.each(["start", "center", "end", "stretch"] as const)("applies align %s", async (align) => {
    const { root } = await render(<idg-stack align={align}>Item</idg-stack>);
    expect(part(root, "stack").classList.contains(`align-${align}`)).toBe(true);
  });

  it("falls back to stretch for an alignment it does not know", async () => {
    const { root } = await render(<idg-stack align={"baseline" as "start"}>Item</idg-stack>);
    expect(part(root, "stack").classList.contains("align-stretch")).toBe(true);
  });

  it("draws dividers between children when asked", async () => {
    const { root } = await render(<idg-stack dividers>Item</idg-stack>);
    expect(part(root, "stack").classList.contains("dividers")).toBe(true);
    expect(root.hasAttribute("dividers")).toBe(true);
  });

  it("adds no role, name, tab stop or inline style", async () => {
    const { root } = await render(
      <idg-stack gap="l" align="center" dividers>
        Item
      </idg-stack>,
    );
    expectPresentational(root);
  });
});
