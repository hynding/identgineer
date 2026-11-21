import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "../menu-group/menu-group";
import "../menu-separator/menu-separator";
import "./menu-item";

function item(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="item"]');
  if (!element) throw new Error("idg-menu-item rendered no item part");
  return element;
}

describe("idg-menu-item roles and states", () => {
  it("is a menuitem out of the tab order by default", async () => {
    const { root } = await render(<idg-menu-item value="edit">Edit</idg-menu-item>);
    expect(item(root).getAttribute("role")).toBe("menuitem");
    expect(item(root).getAttribute("tabindex")).toBe("-1");
    expect(item(root).hasAttribute("aria-checked")).toBe(false);
    expect(item(root).querySelector("slot:not([name])")).not.toBeNull();
  });

  it.each([
    ["checkbox", "menuitemcheckbox"],
    ["radio", "menuitemradio"],
  ] as const)("a %s item is a %s that reports whether it is checked", async (type, role) => {
    const unchecked = await render(<idg-menu-item type={type}>A</idg-menu-item>);
    expect(item(unchecked.root).getAttribute("role")).toBe(role);
    expect(item(unchecked.root).getAttribute("aria-checked")).toBe("false");
    const checked = await render(
      <idg-menu-item type={type} checked>
        A
      </idg-menu-item>,
    );
    expect(item(checked.root).getAttribute("aria-checked")).toBe("true");
  });

  it("falls back to a plain item for a type it does not know", async () => {
    const { root } = await render(<idg-menu-item type={"toggle" as "item"}>A</idg-menu-item>);
    expect(item(root).getAttribute("role")).toBe("menuitem");
  });

  it("marks a disabled item unavailable but keeps it focusable", async () => {
    const { root } = await render(<idg-menu-item disabled>Archive</idg-menu-item>);
    expect(item(root).getAttribute("aria-disabled")).toBe("true");
    expect(item(root).getAttribute("tabindex")).toBe("-1");
  });
});

describe("idg-menu-item links", () => {
  it("is a link menuitem with a safe url and hardened rel", async () => {
    const { root } = await render(
      <idg-menu-item href="https://example.com/help" target="_blank">
        Help
      </idg-menu-item>,
    );
    const element = item(root);
    expect(element.tagName).toBe("A");
    expect(element.getAttribute("role")).toBe("menuitem");
    expect(element.getAttribute("href")).toBe("https://example.com/help");
    expect(element.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", " https://example.com"])(
    "drops the unsafe url %j",
    async (href) => {
      const { root } = await render(<idg-menu-item href={href}>Help</idg-menu-item>);
      expect(item(root).hasAttribute("href")).toBe(false);
      expect(item(root).getAttribute("role")).toBe("menuitem");
    },
  );

  it("drops the url of a disabled link", async () => {
    const { root } = await render(
      <idg-menu-item href="/help" disabled>
        Help
      </idg-menu-item>,
    );
    expect(item(root).hasAttribute("href")).toBe(false);
  });
});

describe("idg-menu-item decoration", () => {
  it("shows a shortcut hint hidden from assistive technology and announces the shortcut", async () => {
    const { root } = await render(<idg-menu-item shortcut="Ctrl+E">Edit</idg-menu-item>);
    const hint = root.shadowRoot?.querySelector("kbd");
    expect(hint?.textContent).toBe("Ctrl+E");
    expect(hint?.getAttribute("aria-hidden")).toBe("true");
    expect(item(root).getAttribute("aria-keyshortcuts")).toBe("Ctrl+E");
  });

  it("draws a leading icon as decoration", async () => {
    const { root } = await render(<idg-menu-item icon="edit">Edit</idg-menu-item>);
    const icon = root.shadowRoot?.querySelector('idg-icon[part="icon"]');
    expect(icon?.getAttribute("name")).toBe("edit");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("idg-menu-separator and idg-menu-group", () => {
  it("a separator is a separator", async () => {
    const { root } = await render(<idg-menu-separator />);
    expect(root.shadowRoot?.querySelector('[part="separator"]')?.getAttribute("role")).toBe(
      "separator",
    );
  });

  it("a group is a group named by its visible label", async () => {
    const { root } = await render(
      <idg-menu-group label="Sort by">
        <idg-menu-item type="radio">Name</idg-menu-item>
      </idg-menu-group>,
    );
    const group = root.shadowRoot?.querySelector('[role="group"]');
    const id = group?.getAttribute("aria-labelledby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.textContent).toBe("Sort by");
    expect(group?.querySelector("slot")).not.toBeNull();
  });
});
