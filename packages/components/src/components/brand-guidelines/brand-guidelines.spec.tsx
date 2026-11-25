import { readFileSync } from "node:fs";
import {
  generateBrandTheme,
  parseBrandKit,
  type BrandKit,
  type BrandTheme,
} from "@identgineer/brand";
import { h, render } from "@stencil/vitest";
import { describe, expect, it } from "vitest";
import "../brand-logo/brand-logo";
import "../brand-swatches/brand-swatches";
import "./brand-guidelines";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);

function kitOf(file: string): BrandKit {
  const result = parseBrandKit(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")));
  if (!result.ok) throw new Error(`${file} is not a kit`);
  return result.kit;
}

const HARBOUR = kitOf("harbour-lights.kit.json");
const HARBOUR_THEME: BrandTheme = generateBrandTheme(HARBOUR);
const ACME = kitOf("acme.kit.json");
const ACME_THEME: BrandTheme = generateBrandTheme(ACME);
const THROWING = new Proxy(
  {},
  {
    get(): never {
      throw new Error("no");
    },
    has(): never {
      throw new Error("no");
    },
    ownKeys(): never {
      throw new Error("no");
    },
    getOwnPropertyDescriptor(): never {
      throw new Error("no");
    },
  },
);

const shadow = (root: HTMLElement): ShadowRoot => {
  if (!root.shadowRoot) throw new Error("idg-brand-guidelines has no shadow root");
  return root.shadowRoot;
};
const all = (root: HTMLElement, selector: string) => [...shadow(root).querySelectorAll(selector)];
const one = (root: HTMLElement, selector: string) => shadow(root).querySelector(selector);
const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replaceAll(/\s+/g, " ").trim();

interface LogoElement extends HTMLElement {
  logo?: string;
  name?: string;
  variant?: string;
}

const section = (root: HTMLElement, name: string) => one(root, `section[data-section="${name}"]`);

describe("idg-brand-guidelines headings", () => {
  it("heads the guide with the brand's name at level 2, and each section one level deeper", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    expect(all(root, "h2").map(text)).toEqual(["Harbour Lights"]);
    expect(all(root, "h3").map(text)).toEqual([
      "Logo and mark",
      "Colours",
      "Gradient",
      "Typography",
      "Corners",
      "Tone",
      "Notes and adjustments",
    ]);
  });

  it("takes the level from headingLevel, and falls back to 2 for one that is not a level", async () => {
    const { root, setProps } = await render(
      <idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} headingLevel={4} />,
    );
    expect(all(root, "h4")).toHaveLength(1);
    expect(all(root, "h5").length).toBeGreaterThan(5);
    await setProps({ headingLevel: 9 });
    expect(all(root, "h2")).toHaveLength(1);
    await setProps({ headingLevel: 6 });
    expect(all(root, "h6").length).toBeGreaterThan(5);
    expect(all(root, "h7")).toHaveLength(0);
  });

  it("names every section by its heading", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    const sections = all(root, "section");
    expect(sections).toHaveLength(7);
    for (const element of sections) {
      const heading = shadow(root).getElementById(element.getAttribute("aria-labelledby") ?? "");
      expect(heading?.localName).toBe("h3");
    }
  });

  it("is named by label, or by a default", async () => {
    const named = await render(<idg-brand-guidelines kit={HARBOUR} label="Harbour guide" />);
    expect(one(named.root, '[part="guidelines"]')?.getAttribute("aria-label")).toBe(
      "Harbour guide",
    );
    const unnamed = await render(<idg-brand-guidelines kit={HARBOUR} />);
    expect(one(unnamed.root, '[part="guidelines"]')?.getAttribute("aria-label")).toBe(
      "Brand guidelines",
    );
  });
});

describe("idg-brand-guidelines name, tagline and logo", () => {
  it("shows the name and the tagline as text", async () => {
    const { root } = await render(<idg-brand-guidelines kit={ACME} theme={ACME_THEME} />);
    expect(text(one(root, "h2"))).toBe("Acme");
    expect(text(one(root, '[part="tagline"]'))).toBe(ACME.tagline ?? "");
  });

  it("draws the logo and the mark each on a light and a dark backing, through idg-brand-logo", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    const logos = all(root, "idg-brand-logo") as LogoElement[];
    expect(logos).toHaveLength(4);
    expect(logos.map((element) => element.variant ?? element.getAttribute("variant"))).toEqual([
      "logo",
      "logo",
      "mark",
      "mark",
    ]);
    expect(logos.map((element) => element.logo)).toEqual([
      HARBOUR.logo,
      HARBOUR.logo,
      HARBOUR.mark,
      HARBOUR.mark,
    ]);
    for (const element of logos) expect(element.name).toBe("Harbour Lights");
  });

  it("captions each tile and names it as a group by that caption", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    const tiles = all(root, '[data-section="logo"] [role="group"]');
    expect(
      tiles.map((tile) =>
        text(shadow(root).getElementById(tile.getAttribute("aria-labelledby") ?? "")),
      ),
    ).toEqual([
      "Logo on a light background",
      "Logo on a dark background",
      "Mark on a light background",
      "Mark on a dark background",
    ]);
  });

  it("sets each backing's colours as custom properties of the brand's own, through the style api", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    const tiles = all(root, ".tile") as HTMLElement[];
    expect(tiles).toHaveLength(4);
    for (const [index, tile] of tiles.entries()) {
      const scheme = index % 2 === 0 ? "light" : "dark";
      const colours = HARBOUR_THEME.document[scheme].color;
      const value = (role: string) => (colours[role] as { $value: string }).$value;
      expect(tile.style.getPropertyValue("--_backing")).toBe(value("bg"));
      expect(tile.style.getPropertyValue("--_text")).toBe(value("text"));
      expect(tile.style.getPropertyValue("--_accent")).toBe(value("accent"));
      expect(tile.style.getPropertyValue("--_on-accent")).toBe(value("on-accent"));
      expect(tile.style.length).toBe(4);
      expect(tile.getAttribute("data-scheme")).toBe(scheme);
    }
  });

  it("says when the kit has no logo or mark, and the name stands in", async () => {
    const bare = { ...ACME, logo: undefined, mark: undefined };
    const { root } = await render(<idg-brand-guidelines kit={bare} theme={ACME_THEME} />);
    expect(all(root, "idg-brand-logo")).toHaveLength(4);
    const notes = all(root, '[data-section="logo"] [part="note"]').map(text);
    expect(notes).toEqual([
      "This kit has no logo, so its name stands in for it as a wordmark.",
      "This kit has no mark, so the first letters of its name stand in for it.",
    ]);
  });

  it("says nothing of a missing logo when the kit has both", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    expect(all(root, '[data-section="logo"] [part="note"]')).toHaveLength(0);
  });

  it("treats a logo the sanitiser would not return as missing, and still draws the fallback", async () => {
    const hostile = { ...HARBOUR, logo: '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>' };
    const { root } = await render(<idg-brand-guidelines kit={hostile} theme={HARBOUR_THEME} />);
    expect(all(root, '[data-section="logo"] [part="note"]').map(text)).toEqual([
      "This kit has no logo, so its name stands in for it as a wordmark.",
    ]);
  });

  it("leaves the tiles out of the page's own colours when the theme has no colours, and draws one tile each", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} />);
    expect(all(root, ".tile")).toHaveLength(2);
    expect((all(root, ".tile")[0] as HTMLElement).style.length).toBe(0);
  });
});

describe("idg-brand-guidelines colours and gradient", () => {
  it("shows the colours the kit was made from, as chips with their values as text", async () => {
    const { root } = await render(<idg-brand-guidelines kit={ACME} theme={ACME_THEME} />);
    const items = all(root, '[data-section="colours"] .source li');
    expect(items.map(text)).toEqual(["Primary #4f46e5", "Secondary #0f766e"]);
    const chip = items[0]?.querySelector<HTMLElement>(".chip");
    expect(chip?.style.getPropertyValue("--_chip")).toBe("#4f46e5");
    expect(chip?.getAttribute("aria-hidden")).toBe("true");
  });

  it("holds the swatches, named for the brand, and passes the theme on", async () => {
    const { root } = await render(<idg-brand-guidelines kit={ACME} theme={ACME_THEME} />);
    const swatches = one(root, "idg-brand-swatches") as (HTMLElement & { theme?: unknown }) | null;
    expect(swatches?.theme).toBe(ACME_THEME);
    expect(swatches?.getAttribute("label")).toBe("Acme colours");
  });

  it("passes the words of the swatches on", async () => {
    const { root } = await render(
      <idg-brand-guidelines kit={ACME} theme={ACME_THEME} swatchLabels={{ light: "Hell" }} />,
    );
    expect((one(root, "idg-brand-swatches") as HTMLElement & { labels?: unknown }).labels).toEqual({
      light: "Hell",
    });
  });

  it("draws the brand gradient of each scheme as one validated custom property, and writes its stops", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    const bars = all(root, ".gradient") as HTMLElement[];
    expect(bars).toHaveLength(2);
    expect(bars[0]?.style.getPropertyValue("--_gradient")).toBe(
      "linear-gradient(135deg, #f4c430 0%, #ffb982 100%)",
    );
    expect(bars[0]?.style.length).toBe(1);
    expect(bars[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(all(root, '[data-section="gradient"] li').map(text)).toContain("#f4c430 at 0%");
    expect(all(root, '[data-section="gradient"] li').map(text)).toContain("#ffb982 at 100%");
  });

  it("leaves the gradient section out when the theme has no valid gradient", async () => {
    const bare = {
      ...HARBOUR_THEME.document,
      light: { color: HARBOUR_THEME.document.light.color },
      dark: { color: HARBOUR_THEME.document.dark.color },
    };
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={bare} />);
    expect(section(root, "gradient")).toBeNull();
    expect(section(root, "colours")).not.toBeNull();
  });
});

describe("idg-brand-guidelines typography, corners and tone", () => {
  it("names the pairing and each face's families as text", async () => {
    const { root } = await render(<idg-brand-guidelines kit={ACME} theme={ACME_THEME} />);
    const typography = section(root, "typography");
    expect(text(typography)).toContain("Font pairing");
    expect(text(typography)).toContain("Geometric sans over system sans");
    expect(text(typography)).toContain(
      "Avenir Next, Avenir, Century Gothic, Futura, Segoe UI, system-ui, sans-serif",
    );
    expect(text(typography)).toContain("weight 600");
  });

  it("sets the specimen's fonts as custom properties built from the pairing, and loads nothing", async () => {
    const { root } = await render(<idg-brand-guidelines kit={ACME} theme={ACME_THEME} />);
    const specimen = one(root, ".specimen") as HTMLElement;
    expect(specimen.style.getPropertyValue("--_heading-family")).toContain('"Avenir Next"');
    expect(specimen.style.getPropertyValue("--_heading-weight")).toBe("600");
    expect(all(root, "link, style, script, img, iframe")).toHaveLength(0);
    expect(shadow(root).innerHTML).not.toMatch(/@font-face|url\(/);
  });

  it("draws a sample shape for each corner radius, with its value as text", async () => {
    const { root } = await render(<idg-brand-guidelines kit={ACME} theme={ACME_THEME} />);
    const samples = all(root, ".corner") as HTMLElement[];
    expect(samples.map(text)).toEqual([
      "Small: 0.25rem",
      "Medium: 0.5rem",
      "Large: 0.75rem",
      "Pill: 9999px",
    ]);
    expect(
      samples.map((sample) =>
        sample.querySelector<HTMLElement>(".corner-shape")?.style.getPropertyValue("--_radius"),
      ),
    ).toEqual(["0.25rem", "0.5rem", "0.75rem", "9999px"]);
    expect(text(section(root, "corners"))).toContain("Soft corners");
  });

  it("says the tone in words", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    expect(text(one(root, '[data-section="tone"] [part="tone"]'))).toBe(
      "Vivid: strong colour and punchy contrast.",
    );
  });
});

describe("idg-brand-guidelines notes and adjustments", () => {
  it("writes each note and adjustment as a sentence", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    const notes = all(root, '[data-section="notes"] [part="note"]').map(text);
    expect(notes[0]).toMatch(
      /^In the light scheme the warning colour is close to the accent \(a distance of 0\.06\), so a primary and a warning button can look alike\.$/,
    );
    const adjustments = all(root, '[data-section="notes"] .adjustments li').map(text);
    expect(adjustments).toHaveLength(HARBOUR_THEME.adjustments.length);
    expect(adjustments[0]).toBe(
      "In the light scheme accent-indicator moved from #f4c430 to #a07d00 (from your primary colour) to reach 3:1 against accent-subtle: it was 1.28:1 and is now 3.01:1.",
    );
  });

  it("says nothing was moved for a theme that has no notes and no adjustments", async () => {
    const { root } = await render(
      <idg-brand-guidelines kit={ACME} theme={{ ...ACME_THEME, adjustments: [], notes: [] }} />,
    );
    expect(text(section(root, "notes"))).toContain(
      "The generator moved no colour and has nothing to flag.",
    );
  });

  it("leaves the section out for a document, which carries neither", async () => {
    const { root } = await render(<idg-brand-guidelines kit={ACME} theme={ACME_THEME.document} />);
    expect(section(root, "notes")).toBeNull();
  });

  it("says how many more there are beyond the fifty it lists", async () => {
    const adjustment = HARBOUR_THEME.adjustments[0];
    const many = { ...HARBOUR_THEME, adjustments: Array.from({ length: 55 }, () => adjustment) };
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={many} />);
    expect(all(root, ".adjustments li")).toHaveLength(51);
    expect(text(all(root, ".adjustments li")[50])).toBe("And 5 more.");
  });
});

describe("idg-brand-guidelines words", () => {
  it("takes its words from labels, over the English ones", async () => {
    const { root } = await render(
      <idg-brand-guidelines
        kit={HARBOUR}
        theme={HARBOUR_THEME}
        labels={{
          coloursHeading: "Farben",
          logoOn: "{asset} auf {backing}",
          logo: "Logo",
          lightBacking: "Hell",
        }}
      />,
    );
    expect(all(root, "h3").map(text)).toContain("Farben");
    expect(text(all(root, ".caption")[0])).toBe("Logo auf Hell");
  });

  it("formats numbers in the language of the page", async () => {
    document.documentElement.setAttribute("lang", "de");
    try {
      const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
      expect(text(all(root, '[data-section="notes"] [part="note"]')[0])).toContain("0,06");
    } finally {
      document.documentElement.removeAttribute("lang");
    }
  });
});

describe("idg-brand-guidelines with data it cannot trust", () => {
  const CANARY = '<img src=x onerror="window.__pwned = 1"><script>window.__pwned = 1</script>';

  it("shows a name and a tagline that are markup as text, and builds no element from them", async () => {
    const hostile = { ...HARBOUR, name: CANARY, tagline: CANARY };
    const { root } = await render(<idg-brand-guidelines kit={hostile} theme={HARBOUR_THEME} />);
    expect(text(one(root, "h2"))).toContain("<img src=x");
    expect(all(root, "img, script")).toHaveLength(0);
    expect(shadow(root).innerHTML).toContain("&lt;img");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it.each([
    ["nothing", undefined, undefined],
    ["null", null, null],
    ["strings", "kit", "theme"],
    ["numbers", 4, 4],
    ["empty objects", {}, {}],
    ["arrays", [], []],
    ["throwing proxies", THROWING, THROWING],
  ])(
    "renders without throwing for %s, and says there is nothing to show",
    async (_name, kit, theme) => {
      const { root } = await render(
        <idg-brand-guidelines
          kit={kit as unknown as BrandKit}
          theme={theme as unknown as BrandTheme}
        />,
      );
      expect(text(one(root, '[part="empty"]'))).toBe("Nothing to show.");
      expect(all(root, "section")).toHaveLength(0);
    },
  );

  it("leaves out each part that is bad and keeps the others", async () => {
    const hostile = {
      get name(): never {
        throw new Error("no");
      },
      tagline: 7,
      logo: { svg: true },
      mark: undefined,
      colors: { primary: [1, 2, 300], secondary: "red" },
      typography: "comic-sans",
      corners: "bevelled",
      tone: "loud",
    };
    const { root } = await render(
      <idg-brand-guidelines kit={hostile as unknown as BrandKit} theme={HARBOUR_THEME} />,
    );
    expect(one(root, "h2")).toBeNull();
    expect(section(root, "typography")).toBeNull();
    expect(section(root, "tone")).toBeNull();
    expect(section(root, "colours")).not.toBeNull();
    expect(all(root, ".source li")).toHaveLength(0);
    expect(all(root, ".corner")).toHaveLength(4);
  });

  it("builds no style attribute as a string: only validated custom properties are set", async () => {
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={HARBOUR_THEME} />);
    for (const element of all(root, "[style]")) {
      const style = (element as HTMLElement).style;
      for (let index = 0; index < style.length; index += 1) {
        expect(style.item(index)).toMatch(/^--_[a-z-]+$/);
      }
    }
    expect(shadow(root).innerHTML).not.toMatch(/example\.com/);
  });

  it("does not draw colours the theme gives in another format", async () => {
    const hostile = {
      light: {
        color: {
          ...HARBOUR_THEME.document.light.color,
          bg: { $value: "red; background: url(https://example.com/x)" },
        },
        gradient: {
          brand: {
            $value: [
              { color: "red", position: 0 },
              { color: "#000000", position: 1 },
            ],
          },
        },
      },
      dark: HARBOUR_THEME.document.dark,
    };
    const { root } = await render(<idg-brand-guidelines kit={HARBOUR} theme={hostile} />);
    expect(all(root, ".tile")).toHaveLength(2);
    expect(all(root, ".gradient")).toHaveLength(1);
    expect(shadow(root).innerHTML).not.toMatch(/example\.com|red;/);
  });
});
