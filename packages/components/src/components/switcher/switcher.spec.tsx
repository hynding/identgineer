import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./switcher";

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

function sizeClasses(element: HTMLElement): string[] {
  return Array.from(element.classList).filter((name) => name.startsWith("size-"));
}

function limitClasses(element: HTMLElement): string[] {
  return Array.from(element.classList).filter((name) => name.startsWith("limit-"));
}

describe("idg-switcher", () => {
  it("switches below the large threshold, with no limit and the layout's gap", async () => {
    const { root } = await render(<idg-switcher>Item</idg-switcher>);
    const switcher = part(root, "switcher");
    expect(sizeClasses(switcher)).toEqual(["size-l"]);
    expect(limitClasses(switcher)).toEqual([]);
    expect(gapClasses(switcher)).toEqual([]);
    expect(switcher.querySelector("slot:not([name])")).not.toBeNull();
  });

  it.each(["xs", "s", "m", "l", "xl", "2xl"] as const)(
    "applies threshold %s",
    async (threshold) => {
      const { root } = await render(<idg-switcher threshold={threshold}>Item</idg-switcher>);
      expect(sizeClasses(part(root, "switcher"))).toEqual([`size-${threshold}`]);
      expect(root.getAttribute("threshold")).toBe(threshold);
    },
  );

  it.each(["30rem", "screen", "huge", ""])(
    "falls back to the large threshold for %j",
    async (threshold) => {
      const { root } = await render(<idg-switcher threshold={threshold as "m"}>Item</idg-switcher>);
      expect(sizeClasses(part(root, "switcher"))).toEqual(["size-l"]);
    },
  );

  it.each([2, 3, 4, 5, 6])("applies limit %i", async (limit) => {
    const { root } = await render(<idg-switcher limit={limit}>Item</idg-switcher>);
    expect(limitClasses(part(root, "switcher"))).toEqual([`limit-${String(limit)}`]);
    expect(root.getAttribute("limit")).toBe(String(limit));
  });

  it.each([0, 1, 7, 2.5, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    "sets no limit for %s",
    async (limit) => {
      const { root } = await render(<idg-switcher limit={limit}>Item</idg-switcher>);
      expect(limitClasses(part(root, "switcher"))).toEqual([]);
    },
  );

  it.each(["none", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl"] as const)(
    "applies gap %s",
    async (gap) => {
      const { root } = await render(<idg-switcher gap={gap}>Item</idg-switcher>);
      expect(gapClasses(part(root, "switcher"))).toEqual([`gap-${gap}`]);
    },
  );

  it("adds no role, name, tab stop or inline style", async () => {
    const { root } = await render(
      <idg-switcher threshold="s" limit={3} gap="xs">
        Item
      </idg-switcher>,
    );
    expectPresentational(root);
  });
});
