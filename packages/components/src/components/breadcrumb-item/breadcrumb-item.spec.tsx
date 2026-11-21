import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./breadcrumb-item";

describe("idg-breadcrumb-item", () => {
  it("is a list item", async () => {
    const { root } = await render(<idg-breadcrumb-item href="/">Home</idg-breadcrumb-item>);
    expect(root.getAttribute("role")).toBe("listitem");
  });

  it("draws a step with a safe href as a link", async () => {
    const { root } = await render(<idg-breadcrumb-item href="/docs">Docs</idg-breadcrumb-item>);
    const link = root.shadowRoot?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/docs");
    expect(link?.hasAttribute("aria-current")).toBe(false);
  });

  it("draws a step with an unsafe href as plain text", async () => {
    const { root } = await render(
      <idg-breadcrumb-item href="javascript:alert(1)">Docs</idg-breadcrumb-item>,
    );
    expect(root.shadowRoot?.querySelector("a")).toBeNull();
    expect(root.shadowRoot?.querySelector('[part="link"]')).not.toBeNull();
  });

  it("draws a step without an href as plain text", async () => {
    const { root } = await render(<idg-breadcrumb-item>Install</idg-breadcrumb-item>);
    expect(root.shadowRoot?.querySelector("a")).toBeNull();
    expect(root.shadowRoot?.querySelector('[part="link"]')?.localName).toBe("span");
  });

  it("marks the current page on its link, or on its text when it has none", async () => {
    const linked = await render(
      <idg-breadcrumb-item href="/docs" isCurrent>
        Docs
      </idg-breadcrumb-item>,
    );
    expect(linked.root.shadowRoot?.querySelector("a")?.getAttribute("aria-current")).toBe("page");
    const plain = await render(<idg-breadcrumb-item isCurrent>Install</idg-breadcrumb-item>);
    expect(
      plain.root.shadowRoot?.querySelector("span[part='link']")?.getAttribute("aria-current"),
    ).toBe("page");
  });

  it("draws a separator, hidden from assistive technology, unless it is the last step", async () => {
    const inner = await render(<idg-breadcrumb-item href="/">Home</idg-breadcrumb-item>);
    const separator = inner.root.shadowRoot?.querySelector('[part="separator"]');
    expect(separator?.getAttribute("aria-hidden")).toBe("true");
    const last = await render(
      <idg-breadcrumb-item isLast isCurrent>
        Install
      </idg-breadcrumb-item>,
    );
    expect(last.root.shadowRoot?.querySelector('[part="separator"]')).toBeNull();
  });

  it("draws the chevron icon or a slash as the separator", async () => {
    const chevron = await render(<idg-breadcrumb-item>Home</idg-breadcrumb-item>);
    expect(chevron.root.shadowRoot?.querySelector('[part="separator"] idg-icon')).not.toBeNull();
    const slash = await render(<idg-breadcrumb-item separator="slash">Home</idg-breadcrumb-item>);
    expect(slash.root.shadowRoot?.querySelector('[part="separator"]')?.textContent).toBe("/");
    expect(slash.root.shadowRoot?.querySelector('[part="separator"] idg-icon')).toBeNull();
  });
});
