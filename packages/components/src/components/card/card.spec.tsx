import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./card";

function card(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="card"]');
  if (!element) throw new Error("idg-card rendered no card part");
  return element;
}

function part(root: HTMLElement, name: string): HTMLElement | null {
  return root.shadowRoot?.querySelector<HTMLElement>(`[part="${name}"]`) ?? null;
}

describe("idg-card rendering", () => {
  it("is a plain card with medium padding by default", async () => {
    const { root } = await render(<idg-card>Body</idg-card>);
    expect(card(root).classList.contains("variant-plain")).toBe(true);
    expect(card(root).classList.contains("padding-md")).toBe(true);
    expect(card(root).classList.contains("interactive")).toBe(false);
  });

  it.each(["plain", "raised", "outlined", "accent"] as const)(
    "applies variant %s",
    async (variant) => {
      const { root } = await render(<idg-card variant={variant}>Body</idg-card>);
      expect(card(root).classList.contains(`variant-${variant}`)).toBe(true);
      expect(root.getAttribute("variant")).toBe(variant);
    },
  );

  it.each(["none", "sm", "md", "lg"] as const)("applies padding %s", async (padding) => {
    const { root } = await render(<idg-card padding={padding}>Body</idg-card>);
    expect(card(root).classList.contains(`padding-${padding}`)).toBe(true);
  });

  it("falls back to the defaults for values it does not know", async () => {
    const { root } = await render(
      <idg-card variant={"fancy" as "plain"} padding={"huge" as "md"}>
        Body
      </idg-card>,
    );
    expect(card(root).classList.contains("variant-plain")).toBe(true);
    expect(card(root).classList.contains("padding-md")).toBe(true);
  });
});

describe("idg-card slots", () => {
  it("offers media, header, default and footer slots", async () => {
    const { root } = await render(
      <idg-card>
        <img slot="media" alt="" src="/a.png" />
        <span slot="header">Eyebrow</span>
        Body
        <span slot="footer">Footer</span>
      </idg-card>,
    );
    expect(part(root, "media")?.querySelector('slot[name="media"]')).not.toBeNull();
    expect(part(root, "header")?.querySelector('slot[name="header"]')).not.toBeNull();
    expect(part(root, "body")?.querySelector("slot:not([name])")).not.toBeNull();
    expect(part(root, "footer")?.querySelector('slot[name="footer"]')).not.toBeNull();
  });

  it("draws no empty regions, which would still take their padding", async () => {
    const { root } = await render(<idg-card>Body</idg-card>);
    expect(part(root, "media")).toBeNull();
    expect(part(root, "header")).toBeNull();
    expect(part(root, "footer")).toBeNull();
    expect(part(root, "body")).not.toBeNull();
  });

  it("draws no body for a card with only a footer", async () => {
    const { root } = await render(
      <idg-card>
        <span slot="footer">Footer</span>
      </idg-card>,
    );
    expect(part(root, "body")).toBeNull();
  });

  it("does not take whitespace for a body", async () => {
    const { root } = await render(
      <idg-card heading="Title">
        {"  \n  "}
        <span slot="footer">Footer</span>
      </idg-card>,
    );
    expect(part(root, "body")).toBeNull();
  });
});

describe("idg-card heading", () => {
  it("draws the heading as a level 3 heading by default", async () => {
    const { root } = await render(<idg-card heading="Quarterly report">Body</idg-card>);
    const heading = part(root, "heading");
    expect(heading?.tagName).toBe("H3");
    expect(heading?.textContent).toBe("Quarterly report");
    expect(part(root, "header")).not.toBeNull();
  });

  it.each([1, 2, 4, 6])("draws a level %i heading", async (level) => {
    const { root } = await render(
      <idg-card heading="Title" heading-level={level}>
        Body
      </idg-card>,
    );
    expect(part(root, "heading")?.tagName).toBe(`H${String(level)}`);
  });

  it.each([0, 7, 2.5, Number.NaN])(
    "keeps a heading level of %s a real heading level",
    async (level) => {
      const { root } = await render(
        <idg-card heading="Title" heading-level={level}>
          Body
        </idg-card>,
      );
      expect(part(root, "heading")?.tagName).toMatch(/^H[1-6]$/);
    },
  );
});

describe("idg-card as a link", () => {
  it("makes the heading the one link and stretches it over the card", async () => {
    const { root } = await render(
      <idg-card heading="Quarterly report" href="/reports/q3">
        Body
      </idg-card>,
    );
    const links = root.shadowRoot?.querySelectorAll("a") ?? [];
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link?.getAttribute("href")).toBe("/reports/q3");
    expect(link?.textContent).toBe("Quarterly report");
    expect(link?.classList.contains("stretch")).toBe(true);
    expect(part(root, "heading")?.contains(link ?? null)).toBe(true);
  });

  it("looks interactive", async () => {
    const { root } = await render(
      <idg-card heading="Quarterly report" href="/reports/q3">
        Body
      </idg-card>,
    );
    expect(card(root).classList.contains("interactive")).toBe(true);
  });

  it("is a link only when there is a heading to be its text", async () => {
    const { root } = await render(<idg-card href="/reports/q3">Body</idg-card>);
    expect(root.shadowRoot?.querySelector("a")).toBeNull();
    expect(card(root).classList.contains("interactive")).toBe(false);
  });

  it.each(["javascript:alert(1)", "data:text/html,x", " /a", "java\tscript:x"])(
    "drops the unsafe url %j and keeps a plain heading",
    async (href) => {
      const { root } = await render(
        <idg-card heading="Quarterly report" href={href}>
          Body
        </idg-card>,
      );
      expect(root.shadowRoot?.querySelector("a")).toBeNull();
      expect(part(root, "heading")?.textContent).toBe("Quarterly report");
      expect(card(root).classList.contains("interactive")).toBe(false);
    },
  );

  it("hardens a link that opens another browsing context", async () => {
    const { root } = await render(
      <idg-card heading="Report" href="https://example.com" target="_blank" rel="nofollow">
        Body
      </idg-card>,
    );
    const link = root.shadowRoot?.querySelector("a");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")?.split(" ").sort()).toEqual([
      "nofollow",
      "noopener",
      "noreferrer",
    ]);
  });
});

describe("idg-card interactive", () => {
  it("lifts on hover when it is interactive without a link", async () => {
    const { root } = await render(<idg-card interactive>Body</idg-card>);
    expect(card(root).classList.contains("interactive")).toBe(true);
    expect(root.shadowRoot?.querySelector("a")).toBeNull();
    expect(root.hasAttribute("interactive")).toBe(true);
  });
});
