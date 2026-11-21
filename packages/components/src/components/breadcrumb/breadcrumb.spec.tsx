import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "../breadcrumb-item/breadcrumb-item";
import "./breadcrumb";

interface ItemElement extends HTMLElement {
  isCurrent: boolean;
  isLast: boolean;
  separator: string;
}

function items(root: HTMLElement): ItemElement[] {
  return Array.from(root.querySelectorAll<ItemElement>("idg-breadcrumb-item"));
}

const trail = (
  <idg-breadcrumb>
    <idg-breadcrumb-item href="/">Home</idg-breadcrumb-item>
    <idg-breadcrumb-item href="/docs">Docs</idg-breadcrumb-item>
    <idg-breadcrumb-item>Install</idg-breadcrumb-item>
  </idg-breadcrumb>
);

describe("idg-breadcrumb rendering", () => {
  it("is a navigation landmark named Breadcrumb holding an ordered list", async () => {
    const { root } = await render(trail);
    const nav = root.shadowRoot?.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Breadcrumb");
    expect(nav?.querySelector("ol")?.querySelector("slot")).not.toBeNull();
  });

  it("takes its name from the label", async () => {
    const { root } = await render(
      <idg-breadcrumb label="You are here">
        <idg-breadcrumb-item>Home</idg-breadcrumb-item>
      </idg-breadcrumb>,
    );
    expect(root.shadowRoot?.querySelector("nav")?.getAttribute("aria-label")).toBe("You are here");
  });

  it("falls back to the chevron for an unknown separator", async () => {
    const { root } = await render(
      <idg-breadcrumb separator={"arrow" as "slash"}>
        <idg-breadcrumb-item>Home</idg-breadcrumb-item>
        <idg-breadcrumb-item>Docs</idg-breadcrumb-item>
      </idg-breadcrumb>,
    );
    expect(items(root)[0]?.separator).toBe("chevron");
  });
});

describe("idg-breadcrumb items", () => {
  it("marks the last item as the current page and no other", async () => {
    const { root } = await render(trail);
    expect(items(root).map((item) => item.isCurrent)).toEqual([false, false, true]);
    expect(items(root).map((item) => item.isLast)).toEqual([false, false, true]);
  });

  it("marks the item that says so instead of the last one", async () => {
    const { root } = await render(
      <idg-breadcrumb>
        <idg-breadcrumb-item href="/">Home</idg-breadcrumb-item>
        <idg-breadcrumb-item href="/docs" current>
          Docs
        </idg-breadcrumb-item>
        <idg-breadcrumb-item href="/docs/tabs">Tabs</idg-breadcrumb-item>
      </idg-breadcrumb>,
    );
    expect(items(root).map((item) => item.isCurrent)).toEqual([false, true, false]);
    expect(items(root).map((item) => item.isLast)).toEqual([false, false, true]);
  });

  it("hands the separator to every item", async () => {
    const { root } = await render(
      <idg-breadcrumb separator="slash">
        <idg-breadcrumb-item>Home</idg-breadcrumb-item>
        <idg-breadcrumb-item>Docs</idg-breadcrumb-item>
      </idg-breadcrumb>,
    );
    expect(items(root).map((item) => item.separator)).toEqual(["slash", "slash"]);
  });

  it("follows an item that is added or removed", async () => {
    const { root, waitForChanges } = await render(trail);
    const added = document.createElement("idg-breadcrumb-item");
    added.textContent = "Tabs";
    root.append(added);
    root.shadowRoot?.querySelector("slot")?.dispatchEvent(new Event("slotchange"));
    await waitForChanges();
    expect(items(root).map((item) => item.isCurrent)).toEqual([false, false, false, true]);
    added.remove();
    root.shadowRoot?.querySelector("slot")?.dispatchEvent(new Event("slotchange"));
    await waitForChanges();
    expect(items(root).map((item) => item.isCurrent)).toEqual([false, false, true]);
  });

  it("ignores an item that is hidden when finding the last one", async () => {
    const { root } = await render(
      <idg-breadcrumb>
        <idg-breadcrumb-item href="/">Home</idg-breadcrumb-item>
        <idg-breadcrumb-item>Docs</idg-breadcrumb-item>
        <idg-breadcrumb-item hidden>Draft</idg-breadcrumb-item>
      </idg-breadcrumb>,
    );
    expect(items(root).map((item) => item.isLast)).toEqual([false, true, false]);
  });
});
