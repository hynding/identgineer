import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import { readFileSync } from "node:fs";
import { generateBrandTheme, parseBrandKit, type BrandTheme } from "@identgineer/brand";
import "./brand-swatches";
import { SWATCH_GROUPS } from "./brand-swatches-roles";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);
const result = parseBrandKit(JSON.parse(readFileSync(new URL("acme.kit.json", FIXTURES), "utf8")));
if (!result.ok) throw new Error("the fixture kit is not a kit");
const THEME: BrandTheme = generateBrandTheme(result.kit);
const ROLE_COUNT = SWATCH_GROUPS.flatMap((group) => group.roles).length;

const shadow = (root: HTMLElement): ShadowRoot => {
  if (!root.shadowRoot) throw new Error("idg-brand-swatches has no shadow root");
  return root.shadowRoot;
};
const all = (root: HTMLElement, selector: string) => [...shadow(root).querySelectorAll(selector)];
const text = (element: Element | null | undefined) => element?.textContent.trim() ?? "";

function swatch(root: HTMLElement, scheme: "light" | "dark", role: string): Element {
  const found = all(root, `[data-scheme="${scheme}"] .swatch`).find(
    (item) => text(item.querySelector(".role")) === role,
  );
  if (!found) throw new Error(`no ${scheme} swatch for ${role}`);
  return found;
}

describe("idg-brand-swatches with a generated theme", () => {
  it("shows a light and a dark scheme, each a named group", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME} />);
    const schemes = all(root, '[part="scheme"]');
    expect(schemes.map((scheme) => scheme.getAttribute("data-scheme"))).toEqual(["light", "dark"]);
    for (const scheme of schemes) {
      expect(scheme.getAttribute("role")).toBe("group");
      const title = shadow(root).getElementById(scheme.getAttribute("aria-labelledby") ?? "");
      expect(text(title)).toBe(scheme.getAttribute("data-scheme") === "light" ? "Light" : "Dark");
    }
  });

  it("names the whole as a group, from the label or a default", async () => {
    const named = await render(<idg-brand-swatches theme={THEME} label="Acme colours" />);
    expect(shadow(named.root).querySelector('[part="swatches"]')?.getAttribute("aria-label")).toBe(
      "Acme colours",
    );
    const unnamed = await render(<idg-brand-swatches theme={THEME} />);
    expect(
      shadow(unnamed.root).querySelector('[part="swatches"]')?.getAttribute("aria-label"),
    ).toBe("Brand colours");
  });

  it("lists every role of every scheme as a list item, each with its role name and value as text", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME} />);
    for (const scheme of ["light", "dark"] as const) {
      const items = all(root, `[data-scheme="${scheme}"] .swatch`);
      expect(items).toHaveLength(ROLE_COUNT);
      for (const item of items) expect(item.localName).toBe("li");
    }
    const accent = swatch(root, "light", "accent");
    expect(text(accent.querySelector(".value"))).toBe("#4f46e5");
    expect(text(swatch(root, "dark", "bg").querySelector(".value"))).toBe(
      (THEME.document.dark.color["bg"] as { $value: string }).$value,
    );
  });

  it("groups the roles under headings, in lists named for them", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME} />);
    const lists = all(root, '[data-scheme="light"] ul.list');
    expect(lists).toHaveLength(SWATCH_GROUPS.length);
    expect(
      lists.map((list) =>
        text(shadow(root).getElementById(list.getAttribute("aria-labelledby") ?? "")),
      ),
    ).toEqual(["Page", "Text", "Accent", "Status"]);
  });

  it("sets each chip's colour as a custom property, through the style api, and hides the chip from assistive technology", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME} />);
    const chip = swatch(root, "light", "accent").querySelector<HTMLElement>(".chip");
    expect(chip?.getAttribute("aria-hidden")).toBe("true");
    expect(chip?.style.getPropertyValue("--_chip")).toBe("#4f46e5");
    expect(text(chip)).toBe("");
  });

  it("builds no style attribute as a string: the only declaration on a chip is the validated colour", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME} />);
    for (const chip of all(root, ".chip")) {
      const style = (chip as HTMLElement).style;
      expect(style.length).toBe(1);
      expect(style.getPropertyValue("--_chip")).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const element of all(root, "*:not(.chip)"))
      expect(element.hasAttribute("style")).toBe(false);
  });

  it("shows for a text colour its contrast on each background, as text, with whether it meets its minimum", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME} />);
    const pairs = [...swatch(root, "light", "text").querySelectorAll(".pairs li")].map(text);
    expect(pairs.length).toBeGreaterThan(2);
    for (const pair of pairs) {
      expect(pair).toMatch(/^\d+(\.\d+)?:1 on [a-z-]+ passes \d(\.\d)?:1$/);
    }
    expect(pairs.some((pair) => pair.includes(" on bg "))).toBe(true);
  });

  it("shows no contrast for a colour that is only a background", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME} />);
    expect(swatch(root, "light", "bg").querySelector(".pairs")).toBeNull();
  });

  it("takes the theme document alone, the palette part of a theme", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME.document} />);
    expect(all(root, ".swatch")).toHaveLength(ROLE_COUNT * 2);
  });

  it("follows a new theme", async () => {
    const { root, setProps } = await render(<idg-brand-swatches theme={THEME} />);
    const other = parseBrandKit({
      id: "ember",
      name: "Ember",
      colors: { primary: "#c2410c" },
      typography: "system",
      corners: "sharp",
      tone: "vivid",
    });
    if (!other.ok) throw new Error("expected a kit");
    await setProps({ theme: generateBrandTheme(other.kit) });
    expect(text(swatch(root, "light", "accent").querySelector(".value"))).toBe("#c2410c");
  });

  it("says in words when a pair is below its minimum", async () => {
    const weak = {
      light: { color: { text: { $value: "#777777" }, bg: { $value: "#808080" } } },
      dark: { color: {} },
    };
    const { root } = await render(<idg-brand-swatches theme={weak} />);
    const pair = text(swatch(root, "light", "text").querySelector(".pairs li"));
    expect(pair).toMatch(/on bg needs 4\.5:1$/);
  });

  it("formats the ratio in the language of the page", async () => {
    document.documentElement.setAttribute("lang", "de");
    try {
      const { root } = await render(<idg-brand-swatches theme={THEME} />);
      const pair = text(swatch(root, "light", "text").querySelector(".pairs li"));
      expect(pair).toMatch(/^\d+,\d+:1 on /);
    } finally {
      document.documentElement.removeAttribute("lang");
    }
  });

  it("takes its words from labels, over the English ones", async () => {
    const { root } = await render(
      <idg-brand-swatches
        theme={THEME}
        labels={{
          light: "Hell",
          dark: "Dunkel",
          passes: "besteht {minimum}:1",
          groupPage: "Seite",
        }}
      />,
    );
    expect(text(shadow(root).querySelector('[data-scheme="light"] .scheme-title'))).toBe("Hell");
    expect(text(shadow(root).querySelector('[data-scheme="dark"] .scheme-title'))).toBe("Dunkel");
    expect(text(swatch(root, "light", "text").querySelector(".pairs li"))).toMatch(
      /besteht 4\.5:1$/,
    );
    expect(all(root, ".group-title").map(text)).toContain("Seite");
  });
});

describe("idg-brand-swatches with colours it cannot trust", () => {
  const hostile = (value: unknown) => ({
    light: { color: { ...THEME.document.light.color, text: { $value: value } } },
    dark: THEME.document.dark,
  });

  it.each([
    "red",
    "#FFF",
    "rgb(0,0,0)",
    "#000000; background: url(https://example.com/x)",
    "var(--idg-color-bg)",
    '"><img src=x onerror=alert(1)>',
  ])("shows no swatch for the colour %j, and nothing of it", async (value) => {
    const { root } = await render(<idg-brand-swatches theme={hostile(value)} />);
    expect(all(root, '[data-scheme="light"] .swatch')).toHaveLength(ROLE_COUNT - 1);
    expect(
      all(root, '[data-scheme="light"] .swatch').map((item) => text(item.querySelector(".role"))),
    ).not.toContain("text");
    const markup = shadow(root).innerHTML;
    expect(markup).not.toContain("example.com");
    expect(markup).not.toContain("onerror");
    expect(markup).not.toContain("url(");
    for (const chip of all(root, ".chip")) {
      expect((chip as HTMLElement).style.getPropertyValue("--_chip")).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each([
    ["no theme", undefined],
    ["a theme that is not an object", "acme"],
    ["a theme with no colours", { light: {}, dark: {} }],
  ])("says there is nothing to show for %s, and draws no chip", async (_name, theme) => {
    const { root } = await render(<idg-brand-swatches theme={theme as BrandTheme} />);
    expect(all(root, ".chip")).toHaveLength(0);
    expect(text(shadow(root).querySelector('[part="empty"]'))).toBe("No colours to show.");
  });

  it("does not say there is nothing to show when there is something", async () => {
    const { root } = await render(<idg-brand-swatches theme={THEME} />);
    expect(shadow(root).querySelector('[part="empty"]')).toBeNull();
  });

  it("leaves a scheme out when it has no colour of its own", async () => {
    const { root } = await render(
      <idg-brand-swatches theme={{ light: THEME.document.light, dark: { color: {} } }} />,
    );
    expect(
      all(root, '[part="scheme"]').map((scheme) => scheme.getAttribute("data-scheme")),
    ).toEqual(["light"]);
  });
});
