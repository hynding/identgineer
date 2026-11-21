import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./cover";

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

describe("idg-cover", () => {
  it("fills a large block and centres its content, with the layout's gap", async () => {
    const { root } = await render(<idg-cover>Hello</idg-cover>);
    const cover = part(root, "cover");
    expect(sizeClasses(cover)).toEqual(["size-l"]);
    expect(gapClasses(cover)).toEqual([]);
    expect(part(root, "center").querySelector("slot:not([name])")).not.toBeNull();
  });

  it("offers top and bottom slots around the centre, in that order", async () => {
    const { root } = await render(
      <idg-cover>
        <p slot="top">Top</p>
        Hello
        <p slot="bottom">Bottom</p>
      </idg-cover>,
    );
    const order = Array.from(
      root.shadowRoot?.querySelectorAll<HTMLElement>(
        'slot[name="top"], [part="center"], slot[name="bottom"]',
      ) ?? [],
    ).map((element) => element.getAttribute("name") ?? element.getAttribute("part"));
    expect(order).toEqual(["top", "center", "bottom"]);
  });

  it.each([...(["xs", "s", "m", "l", "xl", "2xl"] as const), "screen"] as const)(
    "applies min-height %s",
    async (height) => {
      const { root } = await render(<idg-cover min-height={height}>Hello</idg-cover>);
      expect(sizeClasses(part(root, "cover"))).toEqual([`size-${height}`]);
      expect(root.getAttribute("min-height")).toBe(height);
    },
  );

  it.each(["100vh", "50rem", "huge", "0"])(
    "falls back to the large height for %j",
    async (height) => {
      const { root } = await render(<idg-cover min-height={height as "m"}>Hello</idg-cover>);
      expect(sizeClasses(part(root, "cover"))).toEqual(["size-l"]);
    },
  );

  it.each(["none", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl"] as const)(
    "applies gap %s",
    async (gap) => {
      const { root } = await render(<idg-cover gap={gap}>Hello</idg-cover>);
      expect(gapClasses(part(root, "cover"))).toEqual([`gap-${gap}`]);
    },
  );

  it("adds no role, name, tab stop or inline style", async () => {
    const { root } = await render(
      <idg-cover min-height="screen" gap="m">
        Hello
      </idg-cover>,
    );
    expectPresentational(root);
  });
});
