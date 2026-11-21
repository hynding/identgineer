import { beforeEach, describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import { installSlotAssignment } from "../../testing/slot-assignment";
import "./sidebar";

beforeEach(() => {
  installSlotAssignment();
});

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

/** The parts in the order the flattened tree draws them, which is the order a reader and Tab follow. */
function partOrder(root: HTMLElement): string[] {
  return Array.from(
    root.shadowRoot?.querySelectorAll<HTMLElement>('[part="side"], [part="content"]') ?? [],
  ).map((element) => element.getAttribute("part") ?? "");
}

describe("idg-sidebar", () => {
  it("puts the side region first, with the layout's width and gap", async () => {
    const { root } = await render(
      <idg-sidebar>
        <nav slot="side">Side</nav>
        Content
      </idg-sidebar>,
    );
    const sidebar = part(root, "sidebar");
    expect(sizeClasses(sidebar)).toEqual([]);
    expect(gapClasses(sidebar)).toEqual([]);
    expect(partOrder(root)).toEqual(["side", "content"]);
    expect(part(root, "side").querySelector('slot[name="side"]')).not.toBeNull();
    expect(part(root, "content").querySelector("slot:not([name])")).not.toBeNull();
  });

  it("draws the side region after the content when it is at the end, so the reading order follows", async () => {
    const { root } = await render(
      <idg-sidebar side="end">
        <nav slot="side">Side</nav>
        Content
      </idg-sidebar>,
    );
    expect(partOrder(root)).toEqual(["content", "side"]);
    expect(root.getAttribute("side")).toBe("end");
  });

  it("falls back to the start for a side it does not know", async () => {
    const { root } = await render(<idg-sidebar side={"left" as "start"}>Content</idg-sidebar>);
    expect(partOrder(root)).toEqual(["side", "content"]);
  });

  it.each(["xs", "s", "m", "l", "xl", "2xl"] as const)("applies side-width %s", async (width) => {
    const { root } = await render(<idg-sidebar side-width={width}>Content</idg-sidebar>);
    expect(sizeClasses(part(root, "sidebar"))).toEqual([`size-${width}`]);
    expect(root.getAttribute("side-width")).toBe(width);
  });

  it.each(["18rem", "screen", "huge", "0"])(
    "falls back to the layout's side width for %j",
    async (width) => {
      const { root } = await render(<idg-sidebar side-width={width as "m"}>Content</idg-sidebar>);
      expect(sizeClasses(part(root, "sidebar"))).toEqual([]);
    },
  );

  it.each(["none", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl"] as const)(
    "applies gap %s",
    async (gap) => {
      const { root } = await render(<idg-sidebar gap={gap}>Content</idg-sidebar>);
      expect(gapClasses(part(root, "sidebar"))).toEqual([`gap-${gap}`]);
    },
  );

  it("adds no role, name, tab stop or inline style", async () => {
    const { root } = await render(
      <idg-sidebar side="end" side-width="l" gap="s">
        <nav slot="side">Side</nav>
        Content
      </idg-sidebar>,
    );
    expectPresentational(root);
  });

  describe("an empty side region", () => {
    it("takes no room when nothing is given to the side slot", async () => {
      const { root } = await render(<idg-sidebar>Content</idg-sidebar>);
      expect(part(root, "side").classList.contains("empty")).toBe(true);
    });

    it("takes no room when what it is given draws nothing", async () => {
      const { root } = await render(
        <idg-sidebar>
          <nav slot="side" hidden>
            Side
          </nav>
          Content
        </idg-sidebar>,
      );
      expect(part(root, "side").classList.contains("empty")).toBe(true);
    });

    it("takes room when it has an item that draws", async () => {
      const { root } = await render(
        <idg-sidebar>
          <nav slot="side">Side</nav>
          Content
        </idg-sidebar>,
      );
      expect(part(root, "side").classList.contains("empty")).toBe(false);
    });

    it("follows an item added to the side slot later", async () => {
      const { root, waitForChanges } = await render(<idg-sidebar>Content</idg-sidebar>);
      const nav = document.createElement("nav");
      nav.setAttribute("slot", "side");
      root.append(nav);
      root.shadowRoot?.querySelector('slot[name="side"]')?.dispatchEvent(new Event("slotchange"));
      await waitForChanges();
      expect(part(root, "side").classList.contains("empty")).toBe(false);
    });
  });
});
