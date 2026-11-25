import { test as base, type Page } from "@playwright/test";
import { FONT_PAIRINGS } from "@identgineer/brand/presets";
import { DESIGNS, LAYOUTS, SCHEMES, THEMES, UX_MODES, applyAxes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { ACME_KIT, ACME_THEME, CANARY, HARBOUR_KIT, HARBOUR_THEME, openBrand } from "./brand-page";
import { measureEdges } from "./chip-edge";
import { contrastRatio } from "./contrast";
import { countDeep, headingsIn, measureReflow } from "./deep";
import { expect, test } from "./fixtures";
import { BROWSER_PORT } from "./port";
import { setTextSize, TEXT_SIZES } from "./text-size";

const ORIGIN = `http://127.0.0.1:${String(BROWSER_PORT)}`;
const GUIDES = "idg-brand-guidelines";

const hex = (colour: string) =>
  `rgb(${[1, 3, 5].map((at) => String(parseInt(colour.slice(at, at + 2), 16))).join(", ")})`;
const value = (theme: typeof HARBOUR_THEME, scheme: "light" | "dark", role: string) =>
  (theme.document[scheme].color[role] as { $value: string }).$value;

/** The text of each element matching the selector in the guide's own shadow root. */
async function texts(page: Page, id: string, selector: string): Promise<string[]> {
  return page
    .locator(`#${id}`)
    .evaluate(
      (host, wanted) =>
        [...(host.shadowRoot?.querySelectorAll(wanted) ?? [])].map((element) =>
          element.textContent.replaceAll(/\s+/g, " ").trim(),
        ),
      selector,
    );
}

test.describe("idg-brand-guidelines content", () => {
  test("heads the guide with the brand's name and its sections one level deeper, with no level skipped on the page", async ({
    page,
  }) => {
    await openBrand(page);
    expect(await headingsIn(page, "#guide-harbour")).toEqual([
      { level: 3, text: "Harbour Lights" },
      ...[
        "Logo and mark",
        "Colours",
        "Gradient",
        "Typography",
        "Corners",
        "Tone",
        "Notes and adjustments",
      ].map((text) => ({ level: 4, text })),
    ]);
    const outline = await page.evaluate(() => {
      const collect = (root: ParentNode): number[] =>
        [...root.querySelectorAll("*")].flatMap((node) => [
          ...(/^h[1-6]$/.test(node.localName) ? [Number(node.localName.slice(1))] : []),
          ...(node.shadowRoot ? collect(node.shadowRoot) : []),
        ]);
      return collect(document);
    });
    expect(outline.length).toBeGreaterThan(20);
    for (const [index, level] of outline.entries()) {
      expect(
        level - (outline[index - 1] ?? 0),
        `heading ${String(index)} (h${String(level)})`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("names the guide, each logo and each backing for assistive technology", async ({ page }) => {
    await openBrand(page);
    const snapshot = await page.locator("#guide-harbour").ariaSnapshot();
    expect(snapshot).toContain('- article "Harbour Lights guidelines"');
    expect(snapshot).toContain('- heading "Harbour Lights" [level=3]');
    for (const group of [
      "Logo on a light background",
      "Logo on a dark background",
      "Mark on a light background",
      "Mark on a dark background",
    ]) {
      expect(snapshot).toContain(`- group "${group}"`);
    }
    expect(snapshot.match(/- img "Harbour Lights"/g)).toHaveLength(4);
    // The chips, the gradient bars and the corner shapes are decoration: the values are text.
    expect(snapshot).toContain("#f4c430 at 0%");
    expect(snapshot).toContain("Small: 0.5rem");
    expect(snapshot).not.toMatch(/- img "(?!Harbour Lights)/);
  });

  test("shows the name, the tagline, the tone and the font pairing as text", async ({ page }) => {
    await openBrand(page);
    expect(await texts(page, "guide-acme", ".name")).toEqual(["Acme Rockets"]);
    expect(await texts(page, "guide-acme", ".tagline")).toEqual(["Up, up & away!"]);
    expect(await texts(page, "guide-acme", '[part="tone"]')).toEqual([
      "Balanced: colour and contrast in measure.",
    ]);
    expect(await texts(page, "guide-acme", ".pairing")).toEqual([
      "Font pairing Geometric sans over system sans",
    ]);
  });

  test("draws each logo and mark as an image on a tile in the brand's own light and dark colours", async ({
    page,
  }) => {
    await openBrand(page);
    const tiles = await page.locator("#guide-harbour").evaluate((host) =>
      [...(host.shadowRoot?.querySelectorAll(".tile") ?? [])].map((tile) => {
        const logo = tile.querySelector("idg-brand-logo");
        const image = logo?.shadowRoot?.querySelector("img") ?? null;
        return {
          scheme: tile.getAttribute("data-scheme"),
          background: getComputedStyle(tile).backgroundColor,
          image:
            image === null
              ? null
              : { alt: image.alt, loaded: image.complete && image.naturalWidth > 0 },
        };
      }),
    );
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      const scheme = tile.scheme === "dark" ? "dark" : "light";
      expect(tile.background).toBe(hex(value(HARBOUR_THEME, scheme, "bg")));
      expect(tile.image?.alt).toBe("Harbour Lights");
    }
    await expect
      .poll(() =>
        page.locator("#guide-harbour").evaluate((host) =>
          [...(host.shadowRoot?.querySelectorAll("idg-brand-logo") ?? [])].every((logo) => {
            const image = logo.shadowRoot?.querySelector("img");
            return (
              image !== null && image !== undefined && image.complete && image.naturalWidth > 0
            );
          }),
        ),
      )
      .toBe(true);
  });

  test("shows the wordmark and the monogram, in the brand's text and accent, and says so, when the kit has no logo", async ({
    page,
  }) => {
    await openBrand(page);
    const found = await page.locator("#guide-acme").evaluate((host) => ({
      images: host.shadowRoot?.querySelectorAll("idg-brand-logo").length ?? 0,
      drawn: [...(host.shadowRoot?.querySelectorAll("idg-brand-logo") ?? [])].map((logo) => ({
        wordmark: logo.shadowRoot?.querySelector(".wordmark")?.textContent ?? null,
        monogram: logo.shadowRoot?.querySelector(".monogram .letters")?.textContent ?? null,
        img: logo.shadowRoot?.querySelector("img") !== null,
      })),
      notes: [...(host.shadowRoot?.querySelectorAll('[data-section="logo"] .note') ?? [])].map(
        (note) => note.textContent,
      ),
    }));
    expect(found.images).toBe(4);
    expect(found.drawn.some((logo) => logo.img)).toBe(false);
    expect(found.drawn.filter((logo) => logo.wordmark === "Acme Rockets")).toHaveLength(2);
    expect(found.drawn.filter((logo) => logo.monogram === "AR")).toHaveLength(2);
    expect(found.notes).toEqual([
      "This kit has no logo, so its name stands in for it as a wordmark.",
      "This kit has no mark, so the first letters of its name stand in for it.",
    ]);
  });

  test("draws the brand gradient of each scheme as the tokens package writes it", async ({
    page,
  }) => {
    await openBrand(page);
    const bars = await page.locator("#guide-harbour").evaluate((host) =>
      [...(host.shadowRoot?.querySelectorAll(".gradient") ?? [])].map((bar) => ({
        image: getComputedStyle(bar).backgroundImage,
        custom: (bar as HTMLElement).style.getPropertyValue("--_gradient"),
      })),
    );
    expect(bars).toHaveLength(2);
    for (const [index, scheme] of (["light", "dark"] as const).entries()) {
      const stops = HARBOUR_THEME.document[scheme].gradient.brand.$value;
      expect(bars[index]?.custom).toBe(
        `linear-gradient(135deg, ${stops.map((stop) => `${stop.color} ${String(stop.position * 100)}%`).join(", ")})`,
      );
      expect(bars[index]?.image).toBe(
        `linear-gradient(135deg, ${stops.map((stop) => `${hex(stop.color)} ${String(stop.position * 100)}%`).join(", ")})`,
      );
    }
  });

  test("sets the specimen in the pairing's own fonts, names them as text and loads none", async ({
    page,
  }) => {
    const watch = await openBrand(page);
    const pairing = FONT_PAIRINGS.find((candidate) => candidate.id === HARBOUR_KIT.typography);
    expect(pairing).toBeDefined();
    const found = await page.locator("#guide-harbour").evaluate((host) => {
      const heading = host.shadowRoot?.querySelector(".sample-heading");
      const body = host.shadowRoot?.querySelector(".sample-body");
      return {
        headingFamily: heading ? getComputedStyle(heading).fontFamily : "",
        headingWeight: heading ? getComputedStyle(heading).fontWeight : "",
        bodyFamily: body ? getComputedStyle(body).fontFamily : "",
        stacks: [...(host.shadowRoot?.querySelectorAll(".stack") ?? [])].map(
          (stack) => stack.textContent,
        ),
        fontFaces: document.fonts.size,
      };
    });
    expect(found.headingFamily.startsWith('"Iowan Old Style"')).toBe(true);
    expect(found.headingWeight).toBe(String(pairing?.displayWeight));
    expect(found.bodyFamily.startsWith("system-ui")).toBe(true);
    expect(found.stacks).toEqual([pairing?.display.join(", "), pairing?.body.join(", ")]);
    expect(found.fontFaces).toBe(0);
    expect(watch.requests.filter((url) => /font|woff|ttf/i.test(url))).toEqual([]);
  });

  test("draws a sample shape for each corner radius, with the radius the theme sets", async ({
    page,
  }) => {
    await openBrand(page);
    const corners = await page.locator("#guide-harbour").evaluate((host) =>
      [...(host.shadowRoot?.querySelectorAll(".corner") ?? [])].map((corner) => ({
        text: corner.textContent.replaceAll(/\s+/g, " ").trim(),
        radius: getComputedStyle(corner.querySelector(".corner-shape") ?? corner)
          .borderTopLeftRadius,
      })),
    );
    expect(corners).toEqual([
      { text: "Small: 0.5rem", radius: "8px" },
      { text: "Medium: 1rem", radius: "16px" },
      { text: "Large: 1.5rem", radius: "24px" },
      { text: "Pill: 9999px", radius: "9999px" },
    ]);
  });

  test("writes the generator's notes and adjustments as sentences, all of them", async ({
    page,
  }) => {
    await openBrand(page);
    const notes = await texts(page, "guide-harbour", '.notes-list [part="note"]');
    expect(notes).toHaveLength(HARBOUR_THEME.notes.length);
    expect(notes[0]).toMatch(/^In the light scheme the warning colour is close to the accent/);
    const adjustments = await texts(page, "guide-harbour", '.adjustments [part="note"]');
    expect(adjustments).toHaveLength(HARBOUR_THEME.adjustments.length);
    for (const sentence of adjustments) {
      expect(sentence).toMatch(
        /^In the (?:light|dark) scheme [a-z-]+ moved from #[0-9a-f]{6} to #[0-9a-f]{6} /,
      );
    }
  });

  test("says what is in the kit and the theme and leaves a guide with neither empty", async ({
    page,
  }) => {
    await openBrand(page);
    expect(await texts(page, "guide-empty", ".empty")).toEqual(["Nothing to show."]);
    expect(await countDeep(page, "#guide-empty", "section")).toBe(0);
    expect(await countDeep(page, "#guide-harbour", "idg-brand-swatches")).toBe(1);
    expect(await countDeep(page, "#guide-acme", ".source li")).toBe(2);
    expect(ACME_THEME.notes).toHaveLength(0);
    expect(ACME_KIT.logo).toBeUndefined();
  });

  test("has nothing to tab to, and nothing moves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openBrand(page);
    const found = await page.locator("#guide-harbour").evaluate((host) => {
      const all = (root: ParentNode): Element[] =>
        [...root.querySelectorAll("*")].flatMap((node) => [
          node,
          ...(node.shadowRoot ? all(node.shadowRoot) : []),
        ]);
      const elements = all(host.shadowRoot ?? host);
      return {
        count: elements.length,
        focusable: elements.filter((element) => (element as HTMLElement).tabIndex >= 0).length,
        moving: elements.filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.animationName !== "none" ||
            style.transitionDuration.split(",").some((duration) => parseFloat(duration) > 0)
          );
        }).length,
      };
    });
    expect(found.count).toBeGreaterThan(100);
    expect(found).toMatchObject({ focusable: 0, moving: 0 });
  });
});

test.describe("idg-brand-guidelines with a kit and a theme it cannot trust", () => {
  test("shows every hostile string as text, builds no element, style or request from it, and runs nothing", async ({
    page,
  }) => {
    const watch = await openBrand(page);
    const found = await page.locator("#guide-hostile").evaluate((host) => {
      const all = (root: ParentNode): Element[] =>
        [...root.querySelectorAll("*")].flatMap((node) => [
          node,
          ...(node.shadowRoot ? all(node.shadowRoot) : []),
        ]);
      const elements = all(host.shadowRoot ?? host);
      return {
        count: elements.length,
        names: [...new Set(elements.map((element) => element.localName))].sort(),
        attributes: elements.flatMap((element) =>
          [...element.attributes].map((attribute) => attribute.name),
        ),
        styles: elements.flatMap((element) =>
          element instanceof HTMLElement ? [element.getAttribute("style") ?? ""] : [],
        ),
        computed: elements.flatMap((element) => {
          const style = getComputedStyle(element);
          return [style.backgroundImage, style.borderTopLeftRadius, style.fontFamily];
        }),
        heading: host.shadowRoot?.querySelector(".name")?.textContent ?? "",
        pwned: (window as unknown as { __pwned?: number }).__pwned,
      };
    });
    expect(found.count).toBeGreaterThan(30);
    expect(
      found.names.filter((name) =>
        ["img", "script", "style", "link", "iframe", "svg", "use", "object", "embed"].includes(
          name,
        ),
      ),
    ).toEqual([]);
    expect(found.attributes.filter((name) => /^on/i.test(name))).toEqual([]);
    expect(found.heading).toContain(CANARY.slice(0, 10));
    // Each declaration on its own, so a style is only private custom properties and nothing else.
    const declarations = found.styles.flatMap((style) =>
      style
        .split(";")
        .map((declaration) => declaration.trim())
        .filter((declaration) => declaration !== ""),
    );
    for (const declaration of declarations) expect(declaration).toMatch(/^--_[a-z-]+: [^;]+$/);
    expect(found.computed.join(" ")).not.toMatch(/example\.com|url\(/);
    expect(found.pwned).toBeUndefined();
    expect(watch.requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
    expect(await watch.violations()).toEqual([]);
  });

  test("keeps the parts that are sound, and drops each that is not", async ({ page }) => {
    await openBrand(page);
    const corners = await texts(page, "guide-hostile", ".corner");
    expect(corners).toEqual(["Pill: 9999px"]);
    expect(await countDeep(page, "#guide-hostile", ".gradient")).toBe(1);
    expect(await countDeep(page, "#guide-hostile", '.adjustments [part="note"]')).toBe(1);
    expect(await countDeep(page, "#guide-hostile", '.notes-list [part="note"]')).toBe(1);
    expect(await countDeep(page, "#guide-hostile", '[data-section="typography"]')).toBe(0);
    expect(await countDeep(page, "#guide-hostile", '[data-section="tone"]')).toBe(0);
    expect(await countDeep(page, "#guide-hostile", ".source li")).toBe(1);
  });
});

test.describe("idg-brand-guidelines under the strict policy alone", () => {
  // The browser refuses the data urls and says so on the console, which every other test treats as
  // a failure; here it is the thing under test.
  base(
    "shows the names where the policy forbids the images, and the images are the only thing blocked",
    async ({ page }) => {
      const messages: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") messages.push(message.text());
      });
      const watch = await openBrand(page, { policy: "strict" });
      expect(messages.every((message) => message.includes("Content Security Policy"))).toBe(true);
      const violations = await watch.violations();
      expect(violations.length).toBeGreaterThan(0);
      for (const violation of violations) expect(violation).toMatch(/^img-src data/);
      const wordmarks = await page
        .locator("#guide-harbour")
        .evaluate((host) =>
          [...(host.shadowRoot?.querySelectorAll("idg-brand-logo") ?? [])].map(
            (logo) => logo.shadowRoot?.querySelector(".wordmark, .monogram") !== null,
          ),
        );
      await expect
        .poll(() =>
          page
            .locator("#guide-harbour")
            .evaluate((host) =>
              [...(host.shadowRoot?.querySelectorAll("idg-brand-logo") ?? [])].every(
                (logo) => logo.shadowRoot?.querySelector(".wordmark, .monogram") !== null,
              ),
            ),
        )
        .toBe(true);
      expect(wordmarks).toHaveLength(4);
      await expect(page.locator("#guide-harbour")).toBeVisible();
    },
  );
});

test.describe("idg-brand-guidelines backings", () => {
  // The wordmark and the monogram are the one text drawn on a tile. Each is in the brand's own text
  // on its own page colour, and its accent letters on its accent, whatever theme and scheme the page has.
  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      test(`reads on every backing in the ${theme} theme, ${scheme} scheme`, async ({ page }) => {
        await openBrand(page);
        await applyAxes(page, { theme, scheme });
        const pairs = await page.locator("#guide-acme").evaluate((host) =>
          [...(host.shadowRoot?.querySelectorAll(".tile") ?? [])].flatMap((tile) => {
            const logo = tile.querySelector("idg-brand-logo")?.shadowRoot;
            const wordmark = logo?.querySelector(".wordmark");
            const monogram = logo?.querySelector(".monogram");
            const letters = logo?.querySelector(".monogram .letters");
            return [
              ...(wordmark
                ? [
                    {
                      kind: "wordmark",
                      text: getComputedStyle(wordmark).color,
                      behind: getComputedStyle(tile).backgroundColor,
                    },
                  ]
                : []),
              ...(monogram && letters
                ? [
                    {
                      kind: "monogram",
                      text: getComputedStyle(monogram).color,
                      behind: getComputedStyle(monogram).backgroundColor,
                    },
                  ]
                : []),
            ];
          }),
        );
        expect(pairs.map((pair) => pair.kind).sort()).toEqual([
          "monogram",
          "monogram",
          "wordmark",
          "wordmark",
        ]);
        for (const pair of pairs) {
          expect(
            contrastRatio(pair.text, pair.behind),
            `${pair.kind}: ${pair.text} on ${pair.behind}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  test("each tile and sample has an edge of at least 3:1 against what is behind it, in every design and scheme", async ({
    page,
  }) => {
    await openBrand(page);
    let measured = 0;
    for (const design of DESIGNS) {
      for (const scheme of SCHEMES) {
        await applyAxes(page, { design, scheme });
        const edges = await measureEdges(
          page.locator("#guide-harbour"),
          ".tile, .gradient, .corner-shape, .source .chip",
        );
        expect(edges.length).toBeGreaterThan(10);
        for (const edge of edges) {
          expect(edge.width).toBe("2px");
          expect(
            edge.ratio,
            `${design} ${scheme} ${edge.label}: ${edge.edge} on ${edge.behind}`,
          ).toBeGreaterThanOrEqual(3);
          measured += 1;
        }
      }
    }
    expect(measured).toBe(DESIGNS.length * SCHEMES.length * 12);
  });
});

test.describe("idg-brand-guidelines across the axes", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openBrand(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await openBrand(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }

  for (const theme of THEMES) {
    test(`has no axe violations in the ${theme} theme, in both schemes`, async ({ page }) => {
      await openBrand(page);
      for (const scheme of SCHEMES) {
        await applyAxes(page, { theme, scheme });
        await expectNoAxeViolations(page);
      }
    });
  }

  test("the layout sets the gap between sections and the number of colours in a row, and the UX mode the text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openBrand(page);
    const gaps = new Set<string>();
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      gaps.add(
        await page
          .locator("#guide-harbour")
          .evaluate(
            (host) =>
              getComputedStyle(host.shadowRoot?.querySelector(".guidelines") ?? host).rowGap,
          ),
      );
    }
    expect(gaps.size).toBeGreaterThan(2);
    const sizes = new Set<string>();
    for (const ux of UX_MODES) {
      await applyAxes(page, { ux });
      sizes.add(
        await page
          .locator("#guide-harbour")
          .evaluate(
            (host) => getComputedStyle(host.shadowRoot?.querySelector(".name") ?? host).fontSize,
          ),
      );
    }
    expect(sizes.size).toBeGreaterThan(1);
  });

  test("each design draws a section its own way", async ({ page }) => {
    await openBrand(page);
    const signatures = new Set<string>();
    for (const design of DESIGNS) {
      await applyAxes(page, { design });
      signatures.add(
        await page.locator("#guide-harbour").evaluate((host) => {
          const section = getComputedStyle(host.shadowRoot?.querySelector(".section") ?? host);
          return [
            section.borderTopStyle,
            section.borderTopWidth,
            section.borderTopLeftRadius,
            section.boxShadow,
            section.backdropFilter,
          ].join(" | ");
        }),
      );
    }
    expect(signatures.size).toBe(DESIGNS.length);
  });
});

test.describe("idg-brand-guidelines reflow", () => {
  for (const layout of LAYOUTS) {
    for (const size of TEXT_SIZES) {
      test(`has no sideways scroll at 320px in the ${layout} layout at ${size.label}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await openBrand(page);
        await applyAxes(page, { layout });
        await setTextSize(page, size);
        await expect
          .poll(async () => {
            const found = await measureReflow(page, GUIDES);
            return {
              page: found.page <= 0,
              wider: found.wider.every((count) => count === 0),
              hosts: found.hosts,
              measured: found.elements > 500,
            };
          })
          .toEqual({ page: true, wider: true, hosts: 4, measured: true });
      });
    }
  }

  test("reflows at 200% text, as at 320px, with nothing wider than its host and the page not scrolling sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openBrand(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect
      .poll(async () => {
        const found = await measureReflow(page, GUIDES);
        return {
          page: found.page <= 0,
          wider: found.wider.every((count) => count === 0),
          hosts: found.hosts,
        };
      })
      .toEqual({ page: true, wider: true, hosts: 4 });
    const found = await page.locator("#guide-harbour").evaluate((host) => {
      const sections = [...(host.shadowRoot?.querySelectorAll(".section") ?? [])];
      return {
        count: sections.length,
        lefts: new Set(sections.map((section) => Math.round(section.getBoundingClientRect().left)))
          .size,
        clipped: [
          ...(host.shadowRoot?.querySelectorAll(".caption, .name, .role, .value, .stack, .note") ??
            []),
        ].filter((element) => element.scrollWidth > element.clientWidth + 1).length,
      };
    });
    expect(found.count).toBe(7);
    expect(found.lefts).toBe(1);
    expect(found.clipped).toBe(0);
  });
});
