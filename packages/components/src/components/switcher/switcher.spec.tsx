import { beforeEach, describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import { removeHost } from "../../testing/remove-host";
import { installSlotAssignment } from "../../testing/slot-assignment";
import { stubMutationObserver } from "../../testing/mutation-observer";
import "./switcher";

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

function overLimit(root: HTMLElement): boolean {
  return part(root, "switcher").classList.contains("over-limit");
}

const items = (count: number) => Array.from({ length: count }, () => <p>Item</p>);

function slotchange(root: HTMLElement): void {
  root.shadowRoot?.querySelector("slot:not([name])")?.dispatchEvent(new Event("slotchange"));
}

describe("idg-switcher", () => {
  it("switches below the large threshold, with no limit and the layout's gap", async () => {
    const { root } = await render(<idg-switcher>Item</idg-switcher>);
    const switcher = part(root, "switcher");
    expect(sizeClasses(switcher)).toEqual(["size-l"]);
    expect(switcher.classList.contains("over-limit")).toBe(false);
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

  it.each([2, 3, 4, 5, 6])("reflects limit %i", async (limit) => {
    const { root } = await render(<idg-switcher limit={limit}>Item</idg-switcher>);
    expect(root.getAttribute("limit")).toBe(String(limit));
  });

  it("stacks at any width when there are more items than the limit", async () => {
    const { root } = await render(<idg-switcher limit={3}>{items(5)}</idg-switcher>);
    expect(overLimit(root)).toBe(true);
  });

  it.each([3, 2])("keeps a row for %i items under a limit of 3", async (count) => {
    const { root } = await render(<idg-switcher limit={3}>{items(count)}</idg-switcher>);
    expect(overLimit(root)).toBe(false);
  });

  it("counts only the items in the default slot", async () => {
    const { root } = await render(
      <idg-switcher limit={2}>
        <p>One</p>
        <p>Two</p>
        <p slot="elsewhere">Not an item</p>
      </idg-switcher>,
    );
    expect(overLimit(root)).toBe(false);
  });

  it("does not count items that draw nothing", async () => {
    const { root } = await render(
      <idg-switcher limit={2}>
        <p>One</p>
        <p hidden>Hidden</p>
        <template></template>
        <script type="application/json"></script>
        <p>Two</p>
      </idg-switcher>,
    );
    expect(overLimit(root)).toBe(false);
  });

  it("counts an item that stops being hidden", async () => {
    const watcher = stubMutationObserver();
    const { root, waitForChanges } = await render(
      <idg-switcher limit={2}>
        <p>One</p>
        <p>Two</p>
        <p hidden id="late">
          Three
        </p>
      </idg-switcher>,
    );
    expect(overLimit(root)).toBe(false);
    const late = root.querySelector("#late");
    late?.removeAttribute("hidden");
    watcher.notify([{ type: "attributes", target: late as Node }]);
    await waitForChanges();
    expect(overLimit(root)).toBe(true);
    late?.setAttribute("hidden", "");
    watcher.notify([{ type: "attributes", target: late as Node }]);
    await waitForChanges();
    expect(overLimit(root)).toBe(false);
    watcher.restore();
  });

  it("catches up on changes made while it was detached", async () => {
    const { root, waitForChanges } = await render(
      <div>
        <idg-switcher limit={2}>
          <p>One</p>
          <p>Two</p>
          <p hidden id="third">
            Three
          </p>
        </idg-switcher>
      </div>,
    );
    const switcher = root.querySelector<HTMLElement>("idg-switcher");
    if (!switcher) throw new Error("no switcher");
    expect(overLimit(switcher)).toBe(false);
    removeHost(switcher);
    switcher.querySelector("#third")?.removeAttribute("hidden");
    root.append(switcher);
    await waitForChanges();
    expect(overLimit(switcher)).toBe(true);
  });

  it("counts what the slot is given, so items forwarded through another slot count", async () => {
    const { root } = await render(<idg-switcher limit={2}>{items(1)}</idg-switcher>);
    const slot = root.shadowRoot?.querySelector<HTMLSlotElement>("slot:not([name])");
    if (!slot) throw new Error("no slot");
    slot.assignedElements = () => [1, 2, 3].map(() => document.createElement("p"));
    slot.dispatchEvent(new Event("slotchange"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(overLimit(root)).toBe(true);
  });

  it.each([0, 1, 7, 2.5, -3, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
    "never stacks for the limit %s, which is not 2 to 6",
    async (limit) => {
      const { root } = await render(<idg-switcher limit={limit}>{items(9)}</idg-switcher>);
      expect(overLimit(root)).toBe(false);
    },
  );

  it("follows items added and removed after it first drew", async () => {
    const { root } = await render(<idg-switcher limit={2}>{items(2)}</idg-switcher>);
    expect(overLimit(root)).toBe(false);
    root.append(document.createElement("p"));
    slotchange(root);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(overLimit(root)).toBe(true);
    root.lastElementChild?.remove();
    slotchange(root);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(overLimit(root)).toBe(false);
  });

  it("follows a limit changed after it first drew", async () => {
    const { root, waitForChanges } = await render(
      <idg-switcher limit={4}>{items(3)}</idg-switcher>,
    );
    expect(overLimit(root)).toBe(false);
    root.setAttribute("limit", "2");
    await waitForChanges();
    expect(overLimit(root)).toBe(true);
  });

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
