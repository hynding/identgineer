import type { Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, SCHEMES, THEMES, UX_MODES, applyAxes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { HARBOUR_THEME, openBrand } from "./brand-page";
import { measureChipEdges } from "./chip-edge";
import { contrastRatio } from "./contrast";
import { expect, test } from "./fixtures";
import { BROWSER_PORT } from "./port";
import { setTextSize, TEXT_SIZES } from "./text-size";

const ORIGIN = `http://127.0.0.1:${String(BROWSER_PORT)}`;

/** The inner text of each swatch of one scheme: the role, the value and the contrast lines. */
async function swatchTexts(page: Page, id: string, scheme: "light" | "dark"): Promise<string[]> {
  return page.locator(`#${id}`).evaluate(
    (host, which) =>
      [...(host.shadowRoot?.querySelectorAll(`[data-scheme="${which}"] .swatch`) ?? [])].map(
        (item) =>
          [".role", ".value", ".pair"]
            .flatMap((selector) => [...item.querySelectorAll(selector)])
            .map((part) => part.textContent.replaceAll(/\s+/g, " ").trim())
            .join(" "),
      ),
    scheme,
  );
}

test.describe("idg-brand-swatches content", () => {
  test("shows each role of both schemes with its value as text, the values the theme holds", async ({
    page,
  }) => {
    await openBrand(page);
    for (const scheme of SCHEMES) {
      const texts = await swatchTexts(page, "swatches-harbour", scheme);
      expect(texts).toHaveLength(34);
      for (const [role, token] of Object.entries(HARBOUR_THEME.document[scheme].color)) {
        if (typeof token !== "object") continue;
        expect(
          texts.some((text) => text.startsWith(`${role} ${token.$value}`)),
          `${scheme} ${role}`,
        ).toBe(true);
      }
    }
  });

  test("draws each chip in the colour of its value, through a custom property", async ({
    page,
  }) => {
    await openBrand(page);
    const chips = await page.locator("#swatches-harbour").evaluate((host) =>
      [...(host.shadowRoot?.querySelectorAll('[data-scheme="light"] .swatch') ?? [])].map(
        (item) => ({
          value: item.querySelector(".value")?.textContent ?? "",
          custom: item.querySelector<HTMLElement>(".chip")?.style.getPropertyValue("--_chip") ?? "",
          drawn: getComputedStyle(item.querySelector(".chip") ?? item).backgroundColor,
        }),
      ),
    );
    expect(chips).toHaveLength(34);
    for (const { value, custom, drawn } of chips) {
      expect(custom).toBe(value);
      const channels = [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
      expect(drawn).toBe(`rgb(${channels.join(", ")})`);
    }
  });

  test("lists contrast with the ratio the theme really has, and says whether it passes", async ({
    page,
  }) => {
    await openBrand(page);
    const colours = (scheme: "light" | "dark") => {
      const token = HARBOUR_THEME.document[scheme].color;
      const value = (role: string) => {
        const entry = token[role];
        return typeof entry === "object" ? entry.$value : "";
      };
      return value;
    };
    for (const scheme of SCHEMES) {
      const texts = await swatchTexts(page, "swatches-harbour", scheme);
      const text = texts.find((candidate) => candidate.startsWith("text #")) ?? "";
      const pattern = /(\d+\.\d+):1 on ([a-z-]+) passes (\d(?:\.\d)?):1/g;
      const lines = [...text.matchAll(pattern)];
      expect(lines.length).toBeGreaterThanOrEqual(3);
      const value = colours(scheme);
      for (const [, shown, background] of lines) {
        const ratio = contrastRatio(hexToRgb(value("text")), hexToRgb(value(background ?? "")));
        // Shown rounded down to two decimals.
        expect(Number(shown)).toBeCloseTo(Math.floor(ratio * 100) / 100, 2);
        expect(Number(shown)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("has a list per group, named, and list items for the swatches, in the accessibility tree", async ({
    page,
  }) => {
    await openBrand(page);
    const snapshot = await page.locator("#swatches-harbour").ariaSnapshot();
    expect(snapshot).toContain('- group "Harbour Lights colours"');
    expect(snapshot).toContain('- group "Light"');
    expect(snapshot).toContain('- list "Page"');
    expect(snapshot).toContain('- list "Status"');
    expect(snapshot).toContain("- listitem");
    expect(snapshot).toMatch(/accent.*#4f46e5|accent.*#f4c430/s);
    expect(snapshot).toContain("passes 4.5:1");
    // The chips are decoration: nothing in the tree is an image or a button.
    expect(snapshot).not.toMatch(/- img|- button|- link/);
  });

  test("has nothing to tab to, and nothing moves: no transition or animation anywhere", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openBrand(page);
    const found = await page.locator("#swatches-harbour").evaluate((host) => {
      const elements = [...(host.shadowRoot?.querySelectorAll("*") ?? [])];
      return {
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
    expect(found).toEqual({ focusable: 0, moving: 0 });
  });

  test("leaves out colours that are not the package's own format and sets only valid ones on the page", async ({
    page,
  }) => {
    const watch = await openBrand(page);
    const found = await page.locator("#swatches-hostile").evaluate((host) => {
      const items = [...(host.shadowRoot?.querySelectorAll('[data-scheme="light"] .swatch') ?? [])];
      return {
        roles: items.map((item) => item.querySelector(".role")?.textContent ?? ""),
        custom: items.map(
          (item) =>
            item.querySelector<HTMLElement>(".chip")?.style.getPropertyValue("--_chip") ?? "",
        ),
        markup: host.shadowRoot?.innerHTML ?? "",
        pwned: (window as unknown as { __pwned?: number }).__pwned,
      };
    });
    expect(found.roles).toHaveLength(32);
    expect(found.roles).not.toContain("text");
    expect(found.roles).not.toContain("bg");
    for (const value of found.custom) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    expect(found.markup).not.toMatch(/example\.com|onerror|url\(/);
    expect(found.pwned).toBeUndefined();
    expect(
      watch.requests.filter(
        (url) => !url.startsWith(ORIGIN) && !url.startsWith("http://127.0.0.1"),
      ),
    ).toEqual([]);
    expect(await watch.violations()).toEqual([]);
  });

  test("says there is nothing to show when it is given nothing, and draws no chip", async ({
    page,
  }) => {
    await openBrand(page);
    await expect(page.locator("#swatches-empty").locator('[part="empty"]')).toHaveText(
      "No colours to show.",
    );
    expect(await page.locator("#swatches-empty").locator(".chip").count()).toBe(0);
  });
});

function hexToRgb(hex: string): string {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${channels.join(", ")})`;
}

test.describe("idg-brand-swatches chips stay visible", () => {
  // The chip sits on the scheme's surface, which is the design's own fill: the surface colour, the
  // page colour, nothing, or (glass) a 42% tint of the surface over the page. The edge is judged
  // against what is really behind it, composited.
  const AXES = [
    ...THEMES.flatMap((theme) => SCHEMES.map((scheme) => ({ theme, scheme, design: "flat" }))),
    ...DESIGNS.filter((design) => design !== "flat").flatMap((design) =>
      SCHEMES.map((scheme) => ({ theme: "aurora", scheme, design })),
    ),
  ];
  for (const axes of AXES) {
    test(`the chip's edge is at least 3:1 on its surface in ${axes.theme} ${axes.design} ${axes.scheme}`, async ({
      page,
    }) => {
      await openBrand(page);
      await applyAxes(page, axes);
      const edges = await measureChipEdges(page.locator("#swatches-pale"));
      expect(edges).toHaveLength(68);
      for (const edge of edges) {
        expect(edge.width).toBe("2px");
        expect(
          edge.ratio,
          `${edge.scheme} ${edge.role}: ${edge.edge} on ${edge.behind}`,
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }

  test("a chip as light as the page is told from it by its edge in the light scheme", async ({
    page,
  }) => {
    await openBrand(page);
    const found = await page.locator("#swatches-pale").evaluate((host) => {
      const item = [
        ...(host.shadowRoot?.querySelectorAll('[data-scheme="light"] .swatch') ?? []),
      ].find((candidate) => candidate.querySelector(".role")?.textContent === "surface");
      const chip = item?.querySelector(".chip");
      if (!chip) throw new Error("no surface chip");
      const style = getComputedStyle(chip);
      return {
        fill: style.backgroundColor,
        edge: style.borderTopColor,
        page: getComputedStyle(document.documentElement).backgroundColor,
      };
    });
    expect(contrastRatio(found.fill, found.page)).toBeLessThan(1.3);
    expect(contrastRatio(found.edge, found.page)).toBeGreaterThanOrEqual(3);
  });
});

test.describe("idg-brand-swatches across the axes", () => {
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

  test("each design draws the schemes' surface and chips its own way", async ({ page }) => {
    await openBrand(page);
    const signatures = new Set<string>();
    for (const design of DESIGNS) {
      await applyAxes(page, { design });
      signatures.add(
        await page.locator("#swatches-harbour").evaluate((host) => {
          const scheme = getComputedStyle(host.shadowRoot?.querySelector(".scheme") ?? host);
          const chip = getComputedStyle(host.shadowRoot?.querySelector(".chip") ?? host);
          return [
            scheme.borderTopStyle,
            scheme.borderTopWidth,
            scheme.borderTopLeftRadius,
            scheme.boxShadow,
            scheme.backdropFilter,
            chip.borderTopLeftRadius,
            chip.boxShadow,
          ].join(" | ");
        }),
      );
    }
    expect(signatures.size).toBe(DESIGNS.length);
  });

  test("the layout sets how many swatches sit in a row, and the UX mode the size of the text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openBrand(page);
    const columns = new Set<number>();
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      columns.add(
        await page.locator("#swatches-harbour").evaluate((host) => {
          const first = host.shadowRoot?.querySelector('[data-scheme="light"] .list');
          return first
            ? new Set(
                [...first.children].map((item) => Math.round(item.getBoundingClientRect().left)),
              ).size
            : 0;
        }),
      );
    }
    expect(columns.size).toBeGreaterThan(2);

    const sizes = new Set<string>();
    for (const ux of UX_MODES) {
      await applyAxes(page, { ux });
      sizes.add(
        await page
          .locator("#swatches-harbour")
          .evaluate(
            (host) => getComputedStyle(host.shadowRoot?.querySelector(".role") ?? host).fontSize,
          ),
      );
    }
    expect(sizes.size).toBeGreaterThan(1);
  });
});

test.describe("idg-brand-swatches reflow", () => {
  for (const layout of LAYOUTS) {
    for (const size of TEXT_SIZES) {
      test(`has no sideways scroll at 320px in the ${layout} layout at ${size.label}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await openBrand(page);
        await applyAxes(page, { layout });
        await setTextSize(page, size);
        const found = await page.evaluate(() => {
          const root = document.documentElement;
          const hosts = [...document.querySelectorAll("idg-brand-swatches")];
          return {
            page: root.scrollWidth - root.clientWidth,
            inside: hosts.map((host) => {
              const box = host.getBoundingClientRect();
              return [...(host.shadowRoot?.querySelectorAll("*") ?? [])].filter((element) => {
                const edge = element.getBoundingClientRect();
                return edge.width > 0 && edge.right > box.right + 1;
              }).length;
            }),
          };
        });
        expect(found.page).toBeLessThanOrEqual(0);
        expect(found.inside.every((count) => count === 0)).toBe(true);
      });
    }
  }

  test("reflows at 200% zoom, the same as at 320px: one column of schemes and no clipped text", async ({
    page,
  }) => {
    // 200% zoom of a 640px window is a 320px one, and a root font size twice as large.
    await page.setViewportSize({ width: 320, height: 800 });
    await openBrand(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const found = await page.locator("#swatches-harbour").evaluate((host) => {
      const schemes = [...(host.shadowRoot?.querySelectorAll(".scheme") ?? [])];
      return {
        lefts: new Set(schemes.map((scheme) => Math.round(scheme.getBoundingClientRect().left)))
          .size,
        // The host's width is the page's to give: the fixture's headings, set in a wide fallback
        // font at a doubled root size, make the row wider than 320px, so the page's scroll width
        // says nothing about the component. What is the component's own is that nothing inside
        // it is wider than its host.
        overflow: Math.max(
          0,
          ...[...(host.shadowRoot?.querySelectorAll("*") ?? [])].map(
            (element) => element.getBoundingClientRect().right - host.getBoundingClientRect().right,
          ),
        ),
        clipped: [...(host.shadowRoot?.querySelectorAll(".role, .value, .pair") ?? [])].filter(
          (element) => element.scrollWidth > element.clientWidth + 1,
        ).length,
      };
    });
    expect(found.lefts).toBe(1);
    expect(found.overflow).toBeLessThanOrEqual(0);
    expect(found.clipped).toBe(0);
  });
});
