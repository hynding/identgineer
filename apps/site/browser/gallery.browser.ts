import { REGISTRY } from "@identgineer/variations";
import type { Page } from "@playwright/test";
import { COMBINATIONS } from "../src/gallery/gallery-records";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { LAYOUTS, hydrated } from "./pages";

const AXES = ["theme", "design", "layout", "ux"] as const;
const SECTION_IDS = {
  theme: "themes",
  design: "designs",
  layout: "layouts",
  ux: "ux-modes",
} as const;
const STORAGE_KEY = "idg:variations:v1";

const tiles = (page: Page, axis: (typeof AXES)[number]) =>
  page.locator(`li.gallery-tile[data-axis="${axis}"]`);
const rootAttribute = (page: Page, name: string) =>
  page.evaluate((attribute) => document.documentElement.getAttribute(attribute), name);

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/variations/${query}`);
  await hydrated(page, "site-variations");
}

test.describe("the variations gallery", () => {
  test("has one h1 and a section for each axis and for the combinations, in order", async ({
    page,
  }) => {
    await open(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Variations gallery");
    await expect(page.locator("article.prose h2")).toHaveText([
      "Themes",
      "Designs",
      "Layouts",
      "UX modes",
      "Combine",
    ]);
    for (const axis of AXES) {
      await expect(page.locator(`#${SECTION_IDS[axis]}`)).toBeVisible();
      await expect(tiles(page, axis)).toHaveCount(REGISTRY[axis].variations.length);
    }
  });

  test("names every value of every registry, with its description, as a link to apply it", async ({
    page,
  }) => {
    await open(page);
    for (const axis of AXES) {
      const values = REGISTRY[axis].variations;
      const links = tiles(page, axis).locator("a.tile-link");
      await expect(links).toHaveText(values.map((value) => value.label));
      const hrefs = await links.evaluateAll((anchors) =>
        anchors.map((anchor) => anchor.getAttribute("href")),
      );
      expect(hrefs).toEqual(
        values.map((value) => `/variations/?idg-${axis}=${value.id}#${SECTION_IDS[axis]}`),
      );
      const descriptions = await tiles(page, axis).locator("p.tile-description").allTextContents();
      expect(descriptions).toEqual(values.map((value) => value.description));
    }
  });

  test("applies a value the address names, for every value, when its link is followed", async ({
    page,
  }) => {
    for (const axis of AXES) {
      for (const value of REGISTRY[axis].variations) {
        await page.goto(`/variations/?idg-${axis}=${value.id}#${SECTION_IDS[axis]}`);
        expect(await rootAttribute(page, `data-${axis}`)).toBe(value.id);
      }
    }
  });

  test("marks the default of each axis as current, and moves the mark to what the address chose", async ({
    page,
  }) => {
    await open(page);
    for (const axis of AXES) {
      await expect(tiles(page, axis).locator('a[aria-current="true"]')).toHaveCount(1);
      await expect(tiles(page, axis).locator(`a[aria-current="true"]`)).toHaveAttribute(
        "href",
        new RegExp(`idg-${axis}=${REGISTRY[axis].defaultId}#`),
      );
    }
    await expect(
      page.locator('li[data-axis="theme"][data-value="aurora"] a[aria-current="true"]'),
    ).toHaveCount(1);
    await open(page, "?idg-theme=ember&idg-layout=bento");
    await expect(
      page.locator('li[data-axis="theme"][data-value="ember"] a[aria-current="true"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('li[data-axis="theme"][data-value="aurora"] a[aria-current]'),
    ).toHaveCount(0);
    await expect(
      page.locator('li[data-axis="layout"][data-value="bento"] a[aria-current="true"]'),
    ).toHaveCount(1);
    await expect(page.locator('a.tile-link[aria-current="true"]')).toHaveCount(4);
  });

  test("applies a value in place when its tile is chosen, keeps it, and stays on the page", async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => {
      (window as unknown as { __stayed: boolean }).__stayed = true;
    });
    await page.locator('li[data-axis="design"][data-value="brutalist"] a.tile-link').click();
    expect(await rootAttribute(page, "data-design")).toBe("brutalist");
    expect(page.url()).not.toContain("idg-design");
    expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed)).toBe(
      true,
    );
    await expect(
      page.locator('li[data-axis="design"][data-value="brutalist"] a[aria-current="true"]'),
    ).toHaveCount(1);
    await expect(page.locator('li[data-axis="design"] a[aria-current]')).toHaveCount(1);
    await expect(page.locator("article p[role=status]")).toHaveText("Design: Brutalist.");
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ design: "brutalist" });
    await page.reload();
    await hydrated(page, "site-variations");
    expect(await rootAttribute(page, "data-design")).toBe("brutalist");
  });

  test("draws the current mark from the root alone, so it is right before any script has run", async ({
    page,
  }) => {
    await page.route("**/build/site.esm.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    );
    await page.goto("/variations/?idg-theme=ember&idg-ux=power&idg-layout=bento&idg-design=glass");
    const shown = (axis: string, value: string) =>
      page.locator(`li[data-axis="${axis}"][data-value="${value}"] .tile-current`);
    await expect(shown("theme", "ember")).toBeVisible();
    await expect(shown("theme", "aurora")).toBeHidden();
    await expect(shown("ux", "power")).toBeVisible();
    await expect(shown("ux", "comfortable")).toBeHidden();
    await expect(shown("layout", "bento")).toBeVisible();
    await expect(shown("design", "glass")).toBeVisible();
    await expect(shown("design", "flat")).toBeHidden();
    await expect(page.locator(".tile-current:visible")).toHaveCount(4);
  });

  test("claims no tile as current to assistive technology before the app has run, and says so in words", async ({
    page,
  }) => {
    // The bootstrap script has put the choice of the address on the root, and the app, which would
    // set aria-current from it, is not there: no tile may say it is current on the strength of the
    // defaults it was written with. The word "Current", drawn from the root, is the honest mark.
    await page.route("**/build/site.esm.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "" }),
    );
    await page.goto("/variations/?idg-theme=ember");
    await expect(page.locator("a.tile-link")).toHaveCount(32);
    await expect(page.locator("a.tile-link[aria-current]")).toHaveCount(0);
    await expect(
      page.locator('li[data-axis="theme"][data-value="ember"] .tile-current'),
    ).toBeVisible();
    await expect(
      page.locator('li[data-axis="theme"][data-value="aurora"] .tile-current'),
    ).toBeHidden();
  });

  test("draws each preview under its own value, with the real components", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    const read = (axis: string, property: string) =>
      page
        .locator(`li[data-axis="${axis}"] .tile-preview`)
        .evaluateAll(
          (previews, name) =>
            previews.map((preview) => getComputedStyle(preview).getPropertyValue(name).trim()),
          property,
        );
    const swatches = REGISTRY.theme.variations.map((value) => value.preview.swatches.light.bg);
    expect(await read("theme", "--idg-color-bg")).toEqual(swatches);
    const radii = await read("design", "--idg-shape-radius-md");
    expect(radii).toHaveLength(8);
    expect(new Set(radii).size).toBeGreaterThan(3);
    const gaps = await read("ux", "--idg-density-gap-scale");
    expect(new Set(gaps).size).toBeGreaterThan(3);
    for (const axis of ["theme", "design", "ux"] as const) {
      const previews = page.locator(`li[data-axis="${axis}"] .tile-preview`);
      await expect(previews.locator("idg-button")).toHaveCount(8);
      await expect(previews.first().locator("idg-button")).toHaveJSProperty(
        "tagName",
        "IDG-BUTTON",
      );
      await expect(previews.first()).toHaveAttribute("aria-hidden", "true");
      await expect(previews.first()).toHaveJSProperty("inert", true);
    }
  });

  test("draws a layout thumbnail for each layout, each arranged differently", async ({ page }) => {
    await open(page);
    const signatures = await page
      .locator('li[data-axis="layout"] .layout-thumb')
      .evaluateAll((thumbs) =>
        thumbs.map((thumb) => {
          const box = thumb.getBoundingClientRect();
          return [...thumb.children]
            .filter((child) => getComputedStyle(child).display !== "none")
            .map((child) => {
              const rect = child.getBoundingClientRect();
              return [
                child.className,
                Math.round(((rect.left - box.left) / box.width) * 10),
                Math.round(((rect.top - box.top) / box.height) * 10),
                Math.round((rect.width / box.width) * 10),
                Math.round((rect.height / box.height) * 10),
              ].join(":");
            })
            .join("|");
        }),
      );
    expect(signatures).toHaveLength(LAYOUTS.length);
    expect(new Set(signatures).size).toBe(LAYOUTS.length);
    const rail = await page
      .locator('li[data-value="side-rail"] .layout-thumb')
      .evaluate((thumb) => {
        const left = thumb.querySelector(".t-rail")?.getBoundingClientRect();
        const main = thumb.querySelector(".t-main")?.getBoundingClientRect();
        return left !== undefined && main !== undefined && left.right <= main.left;
      });
    expect(rail).toBe(true);
  });

  test("offers curated combinations as links with all four choices, and applies one in place", async ({
    page,
  }) => {
    await open(page);
    const links = page.locator('section[aria-labelledby="combine"] a.combo-link');
    await expect(links).toHaveText(COMBINATIONS.map((combination) => combination.label));
    const first = COMBINATIONS[0];
    if (first === undefined) throw new Error("no combination");
    await expect(links.first()).toHaveAttribute(
      "href",
      `/variations/?idg-theme=${first.state.theme}&idg-design=${first.state.design}&idg-layout=${first.state.layout}&idg-ux=${first.state.ux}#combine`,
    );
    await links.first().click();
    for (const axis of AXES) {
      expect(await rootAttribute(page, `data-${axis}`)).toBe(first.state[axis]);
      await expect(
        page.locator(
          `li[data-axis="${axis}"][data-value="${first.state[axis]}"] a[aria-current="true"]`,
        ),
      ).toHaveCount(1);
    }
  });

  test("offers Surprise me, which changes the look and says what it chose", async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => document.documentElement.outerHTML.slice(0, 200));
    await page.getByRole("button", { name: "Surprise me" }).click();
    await expect(page.locator("article p[role=status]")).toHaveText(/\w/);
    const after = await page.evaluate(() => document.documentElement.outerHTML.slice(0, 200));
    expect(after).not.toBe(before);
    await expect(page.locator('a.tile-link[aria-current="true"]')).toHaveCount(4);
  });

  test("passes axe with a tile of each axis chosen", async ({ page }) => {
    await open(page, "?idg-theme=terminal&idg-design=pixel&idg-layout=magazine&idg-ux=power");
    await expectNoAxeViolations(page);
  });
});

test.describe("the variations gallery without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("is read as links, with the previews drawn, the defaults marked and Surprise me not offered", async ({
    page,
  }) => {
    await page.goto("/variations/");
    await expect(page.locator("a.tile-link")).toHaveCount(32);
    await expect(page.locator("a.tile-link").first()).toHaveAttribute("href", /idg-theme=aurora/);
    await expect(page.locator(".tile-preview idg-button").first()).toBeVisible();
    await expect(page.locator(".tile-current:visible")).toHaveCount(4);
    // Nothing has said what is current but the page's own words; the app does, when it has run.
    await expect(page.locator("a.tile-link[aria-current]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Surprise me" })).toBeHidden();
    await expect(page.locator('section[aria-labelledby="combine"] a.combo-link')).toHaveCount(
      COMBINATIONS.length,
    );
    await expect(page.getByText("Choosing a look needs JavaScript")).toBeVisible();
  });
});
