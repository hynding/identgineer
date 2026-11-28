import { REGISTRY, type VariationAxis } from "@identgineer/variations";
import type { Page } from "@playwright/test";
import { COMBINATIONS } from "../src/gallery/gallery-records";
import { countsLine } from "../src/gallery/gallery-counts";
import { expect, test } from "./fixtures";
import { LAYOUTS, hydrated } from "./pages";

const AXES: readonly VariationAxis[] = ["theme", "design", "layout", "ux"];

async function open(page: Page, query = "", width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/variations/${query}`);
  await hydrated(page, "site-variations");
}

/** `#rrggbb` as the `rgb(r, g, b)` a browser reports a colour in. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

test.describe("the gallery's previews", () => {
  test("make every tile of every axis look different from the others in a still frame", async ({
    page,
  }) => {
    await open(page);
    for (const axis of AXES) {
      const previews = page.locator(`li[data-axis="${axis}"] .tile-preview`);
      const count = await previews.count();
      expect(count).toBe(REGISTRY[axis].variations.length);
      const frames = new Set<string>();
      for (let index = 0; index < count; index += 1) {
        const picture = await previews.nth(index).screenshot({ animations: "disabled" });
        frames.add(picture.toString("base64"));
      }
      expect(frames.size, axis).toBe(count);
    }
  });

  test("show a theme's heading in its display face, and its colours in both schemes", async ({
    page,
  }) => {
    await open(page);
    for (const theme of REGISTRY.theme.variations) {
      const tile = page.locator(`li[data-axis="theme"][data-value="${theme.id}"] .tile-preview`);
      for (const scheme of ["light", "dark"] as const) {
        const half = tile.locator(`[data-scheme="${scheme}"]`);
        const heading = half.locator(".sample-heading");
        await expect(heading).toBeVisible();
        const family = await heading.evaluate((element) => ({
          used: getComputedStyle(element).fontFamily,
          wanted: getComputedStyle(element).getPropertyValue("--idg-font-family-display").trim(),
        }));
        expect(family.used, `${theme.id} heading`).toBe(family.wanted);
        const { bg, surface, text, accent, accentSubtle } = theme.preview.swatches[scheme];
        const colours = await half
          .locator(".scheme-swatch")
          .evaluateAll((all) => all.map((swatch) => getComputedStyle(swatch).backgroundColor));
        expect(colours, `${theme.id} ${scheme}`).toEqual(
          [bg, surface, text, accent, accentSubtle].map(rgb),
        );
      }
    }
  });

  test("show what a UX mode sets, as sizes and cues a still frame can tell apart", async ({
    page,
  }) => {
    await open(page);
    const modes = await page.locator('li[data-axis="ux"] .tile-preview').evaluateAll((all) =>
      all.map((preview) => {
        const box = (selector: string) => preview.querySelector(selector)?.getBoundingClientRect();
        const style = (selector: string) => {
          const element = preview.querySelector(selector);
          return element === null ? undefined : getComputedStyle(element);
        };
        return {
          control: Math.round(box(".ux-control")?.height ?? 0),
          measure: Math.round(box(".ux-measure")?.width ?? 0),
          text: Number.parseFloat(style(".ux-type")?.fontSize ?? "0"),
          ring: Number.parseFloat(style(".ux-focused")?.outlineWidth ?? "0"),
          hint: Number(style(".ux-hint")?.opacity ?? "0"),
          shortcut: Number(style(".ux-kbd")?.opacity ?? "0"),
          gap: Math.round(Number.parseFloat(style(".ux-controls")?.columnGap ?? "0")),
        };
      }),
    );
    const distinct = (pick: (mode: (typeof modes)[number]) => number) =>
      new Set(modes.map(pick)).size;
    expect(distinct((mode) => mode.control)).toBeGreaterThanOrEqual(5);
    expect(distinct((mode) => mode.measure)).toBeGreaterThanOrEqual(5);
    expect(distinct((mode) => mode.text)).toBeGreaterThanOrEqual(5);
    expect(distinct((mode) => mode.gap)).toBeGreaterThanOrEqual(4);
    expect(distinct((mode) => mode.ring)).toBeGreaterThanOrEqual(3);
    expect(modes.filter((mode) => mode.hint > 0)).toHaveLength(1);
    expect(modes.filter((mode) => mode.shortcut > 0)).toHaveLength(1);
  });

  test("move a UX mode's motion sample when its tile is hovered, and keep it still for a visitor who asks for less motion", async ({
    page,
  }) => {
    const travelled = async (): Promise<number> => {
      const dot = page.locator('li[data-value="playful"] .ux-dot');
      const before = (await dot.boundingBox())?.x ?? 0;
      await page.locator('li[data-value="playful"]').hover();
      await page.waitForTimeout(900);
      return ((await dot.boundingBox())?.x ?? 0) - before;
    };
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page);
    expect(await travelled()).toBeGreaterThan(20);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    expect(await travelled()).toBeLessThanOrEqual(1);
  });

  test("draw each layout as a wireframe with its regions and its navigation", async ({ page }) => {
    await open(page);
    expect(LAYOUTS).toHaveLength(8);
    const wireframes = await page
      .locator('li[data-axis="layout"] .layout-thumb')
      .evaluateAll((all) =>
        all.map((thumb) => {
          const shown = (selector: string) =>
            [...thumb.querySelectorAll(selector)].filter(
              (part) => part.getBoundingClientRect().width > 0,
            ).length;
          return {
            regions: shown(".t-bar, .t-rail, .t-hero, .t-main, .t-aside, .t-foot, .t-tile"),
            links: shown(".t-link"),
            heading: shown(".t-title"),
          };
        }),
      );
    for (const wireframe of wireframes) {
      expect(wireframe.regions).toBeGreaterThanOrEqual(3);
      expect(wireframe.links).toBeGreaterThanOrEqual(3);
      expect(wireframe.heading).toBeGreaterThanOrEqual(1);
    }
  });

  test("draw each combination as a small page in its theme, its design and its layout", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    const previews = page.locator(".combo .combo-preview");
    await expect(previews).toHaveCount(COMBINATIONS.length);
    for (const [index, combination] of COMBINATIONS.entries()) {
      const preview = previews.nth(index);
      await expect(preview).toHaveAttribute("data-theme", combination.state.theme);
      await expect(preview).toHaveAttribute("data-design", combination.state.design);
      await expect(preview).toHaveAttribute("data-ux", combination.state.ux);
      await expect(preview.locator(".layout-thumb")).toHaveAttribute(
        "data-layout",
        combination.state.layout,
      );
      const theme = REGISTRY.theme.variations.find((value) => value.id === combination.state.theme);
      const background = await preview.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(background).toBe(rgb(theme?.preview.swatches.light.bg ?? "#000000"));
    }
    const frames = new Set<string>();
    for (let index = 0; index < COMBINATIONS.length; index += 1) {
      frames.add((await previews.nth(index).screenshot()).toString("base64"));
    }
    expect(frames.size).toBe(COMBINATIONS.length);
  });

  test("count the values in its lede and in the page's title area from the registries", async ({
    page,
  }) => {
    await open(page);
    await expect(page.locator(".page-hero .lede")).toContainText(countsLine());
  });
});

/** The columns and rows of the tiles of a list, and the tiles in its last row. */
async function gridOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((list) => {
    const boxes = [...list.children].map((child) => child.getBoundingClientRect());
    const lefts = new Set(boxes.map((box) => Math.round(box.left)));
    const tops = [...new Set(boxes.map((box) => Math.round(box.top)))].sort((a, b) => a - b);
    const last = boxes.filter((box) => Math.round(box.top) === tops.at(-1)).length;
    return {
      columns: lefts.size,
      rows: tops.length,
      last,
      height: list.getBoundingClientRect().height,
    };
  });
}

test.describe("the gallery's grid", () => {
  for (const [width, columns] of [
    [390, 1],
    [820, 2],
    [1440, 3],
    [1920, 3],
  ] as const) {
    test(`sets a list of tiles in at least ${String(columns)} columns at ${String(width)}px, with no row of one`, async ({
      page,
    }) => {
      await open(page, "", width);
      for (const axis of AXES) {
        const grid = await gridOf(page, `ul.gallery-tiles:has(li[data-axis="${axis}"])`);
        expect(grid.columns, `${axis} at ${String(width)}`).toBeGreaterThanOrEqual(columns);
        if (grid.columns > 1) expect(grid.last).not.toBe(1);
      }
    });
  }

  test("keeps the tiles from standing in one tall column in a narrow reading layout with large type", async ({
    page,
  }) => {
    await open(page, "?idg-layout=centered&idg-ux=focus", 1440);
    const grid = await gridOf(page, 'ul.gallery-tiles:has(li[data-axis="theme"])');
    expect(grid.columns).toBeGreaterThanOrEqual(2);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(total).toBeLessThan(10000);
  });

  test("lays out a ninth value in full rows or with no row of one, at every width", async ({
    page,
  }) => {
    for (const width of [390, 820, 1100, 1440, 1920]) {
      await open(page, "", width);
      await page.locator('ul.gallery-tiles:has(li[data-axis="theme"])').evaluate((list) => {
        const first = list.firstElementChild;
        if (first === null) throw new Error("no tile");
        list.append(first.cloneNode(true));
        list.setAttribute("data-count", String(list.children.length));
      });
      const grid = await gridOf(page, 'ul.gallery-tiles:has(li[data-axis="theme"])');
      expect(grid.columns).toBeGreaterThanOrEqual(1);
      if (grid.columns > 1) {
        expect(9 % grid.columns, `${String(width)}px: ${String(grid.columns)} columns`).toBe(0);
      }
    }
  });
});
