import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./link";

function anchor(root: HTMLElement): HTMLAnchorElement {
  const element = root.shadowRoot?.querySelector<HTMLAnchorElement>('a[part="control"]');
  if (!element) throw new Error("idg-link rendered no anchor part");
  return element;
}

describe("idg-link rendering", () => {
  it("renders an anchor holding the slotted text", async () => {
    const { root } = await render(<idg-link href="https://example.com/a">Docs</idg-link>);
    const native = anchor(root);
    expect(native.getAttribute("href")).toBe("https://example.com/a");
    expect(native.querySelector("slot:not([name])")).not.toBeNull();
    expect(root.shadowRoot?.querySelector("idg-icon")).toBeNull();
  });

  it("keeps relative, fragment, mailto and tel urls", async () => {
    for (const href of ["/docs", "#top", "mailto:a@example.com", "tel:+15555550100"]) {
      const { root } = await render(<idg-link href={href}>Link</idg-link>);
      expect(anchor(root).getAttribute("href")).toBe(href);
    }
  });
});

describe("idg-link unsafe urls", () => {
  it.each([
    "javascript:alert(1)",
    " javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:x",
    "java\tscript:alert(1)",
    "\\\\evil.example",
  ])("drops %j and renders an inert link", async (href) => {
    const { root } = await render(<idg-link href={href}>Docs</idg-link>);
    const native = anchor(root);
    expect(native.hasAttribute("href")).toBe(false);
    expect(native.getAttribute("role")).toBe("link");
    expect(native.getAttribute("aria-disabled")).toBe("true");
  });

  it("renders an inert link without an href at all", async () => {
    const { root } = await render(<idg-link>Docs</idg-link>);
    expect(anchor(root).hasAttribute("href")).toBe(false);
    expect(anchor(root).getAttribute("aria-disabled")).toBe("true");
  });

  it("does not keep a target or rel on an inert link", async () => {
    const { root } = await render(
      <idg-link href="javascript:alert(1)" target="_blank" rel="author">
        Docs
      </idg-link>,
    );
    expect(anchor(root).hasAttribute("target")).toBe(false);
    expect(anchor(root).hasAttribute("rel")).toBe(false);
  });
});

describe("idg-link target and rel", () => {
  it("hardens rel whenever the link opens another browsing context", async () => {
    const { root } = await render(
      <idg-link href="https://example.com" target="_blank">
        Docs
      </idg-link>,
    );
    expect(anchor(root).getAttribute("target")).toBe("_blank");
    expect(anchor(root).getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("hardens a rel that tries to weaken it and keeps the author's other tokens", async () => {
    const { root } = await render(
      <idg-link href="https://example.com" target="_blank" rel="nofollow">
        Docs
      </idg-link>,
    );
    expect(anchor(root).getAttribute("rel")?.split(" ").sort()).toEqual([
      "nofollow",
      "noopener",
      "noreferrer",
    ]);
  });

  it("leaves rel alone for same-context targets", async () => {
    const none = await render(<idg-link href="/a">Docs</idg-link>);
    expect(anchor(none.root).hasAttribute("rel")).toBe(false);
    const self = await render(
      <idg-link href="/a" target="_self" rel="author">
        Docs
      </idg-link>,
    );
    expect(anchor(self.root).getAttribute("rel")).toBe("author");
  });
});

describe("idg-link external", () => {
  it("shows an indicator icon that is named for assistive technology", async () => {
    const { root } = await render(
      <idg-link href="https://example.com" external>
        Docs
      </idg-link>,
    );
    const icon = root.shadowRoot?.querySelector("idg-icon");
    expect(icon?.getAttribute("name")).toBe("external-link");
    expect(icon?.getAttribute("label")).toBe("External link");
  });

  it("names the indicator with the label it is given", async () => {
    const { root } = await render(
      <idg-link href="https://example.com" external external-label="Opens another site">
        Docs
      </idg-link>,
    );
    expect(root.shadowRoot?.querySelector("idg-icon")?.getAttribute("label")).toBe(
      "Opens another site",
    );
  });

  it("opens in a new context with hardened rel unless a target is given", async () => {
    const opens = await render(
      <idg-link href="https://example.com" external>
        Docs
      </idg-link>,
    );
    expect(anchor(opens.root).getAttribute("target")).toBe("_blank");
    expect(anchor(opens.root).getAttribute("rel")).toBe("noopener noreferrer");

    const named = await render(
      <idg-link href="https://example.com" external target="_self">
        Docs
      </idg-link>,
    );
    expect(anchor(named.root).getAttribute("target")).toBe("_self");
    expect(anchor(named.root).hasAttribute("rel")).toBe(false);
  });

  it("shows no indicator on an inert link", async () => {
    const { root } = await render(
      <idg-link href="javascript:alert(1)" external>
        Docs
      </idg-link>,
    );
    expect(root.shadowRoot?.querySelector("idg-icon")).toBeNull();
  });
});
