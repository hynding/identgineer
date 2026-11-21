import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./cluster";

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

describe("idg-cluster", () => {
  it("starts its items at the inline start, centred on the block axis, with the layout's gap", async () => {
    const { root } = await render(<idg-cluster>Item</idg-cluster>);
    const cluster = part(root, "cluster");
    expect(cluster.classList.contains("justify-start")).toBe(true);
    expect(cluster.classList.contains("align-center")).toBe(true);
    expect(gapClasses(cluster)).toEqual([]);
    expect(cluster.querySelector("slot:not([name])")).not.toBeNull();
  });

  it.each(["none", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl"] as const)(
    "applies gap %s",
    async (gap) => {
      const { root } = await render(<idg-cluster gap={gap}>Item</idg-cluster>);
      expect(gapClasses(part(root, "cluster"))).toEqual([`gap-${gap}`]);
      expect(root.getAttribute("gap")).toBe(gap);
    },
  );

  it.each(["start", "center", "end", "between"] as const)("applies justify %s", async (justify) => {
    const { root } = await render(<idg-cluster justify={justify}>Item</idg-cluster>);
    expect(part(root, "cluster").classList.contains(`justify-${justify}`)).toBe(true);
  });

  it.each(["start", "center", "end", "baseline", "stretch"] as const)(
    "applies align %s",
    async (align) => {
      const { root } = await render(<idg-cluster align={align}>Item</idg-cluster>);
      expect(part(root, "cluster").classList.contains(`align-${align}`)).toBe(true);
    },
  );

  it("falls back to the defaults for values it does not know", async () => {
    const { root } = await render(
      <idg-cluster gap={"huge" as "m"} justify={"around" as "start"} align={"top" as "start"}>
        Item
      </idg-cluster>,
    );
    const cluster = part(root, "cluster");
    expect(gapClasses(cluster)).toEqual([]);
    expect(cluster.classList.contains("justify-start")).toBe(true);
    expect(cluster.classList.contains("align-center")).toBe(true);
  });

  it("adds no role, name, tab stop or inline style", async () => {
    const { root } = await render(
      <idg-cluster gap="s" justify="between">
        Item
      </idg-cluster>,
    );
    expectPresentational(root);
  });
});
