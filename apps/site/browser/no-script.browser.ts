import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LAYOUTS, PAGES, WIDTHS, sidewaysScroll } from "./pages";

test.use({ javaScriptEnabled: false });

/**
 * Opens a page in a layout with scripting off. A visitor's layout is put on the root by the
 * bootstrap script, which does not run, so the served HTML is given the attribute instead: the
 * page then looks as it would to a visitor whose browser keeps their choice but runs no script.
 */
async function openWithoutScript(page: Page, path: string, layout: string): Promise<void> {
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace("<html ", `<html data-layout="${layout}" `);
      await route.fulfill({ response, body: html });
    },
  );
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-layout", layout);
}

for (const { name, path } of PAGES) {
  for (const layout of LAYOUTS) {
    for (const width of WIDTHS) {
      test(`${name} in ${layout} reads and navigates without JavaScript at ${String(width)}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await openWithoutScript(page, path, layout);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // The page's own landmarks come first. The example of idg-layout is a whole page's frame,
        // inert, so it holds a main and a navigation that nothing can reach; they are the only others.
        const frames = path === "/components/idg-layout/" ? 1 : 0;
        const mainNavigation = page.getByRole("navigation", { name: "Main navigation" });
        for (const landmark of [page.getByRole("main"), mainNavigation]) {
          await expect(landmark).toHaveCount(1 + frames);
          await expect(landmark.first()).toBeVisible();
        }
        await expect(page.getByRole("contentinfo")).toBeVisible();
        // A menu button needs a script to open; without one the header shows its links instead.
        await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
        // The links are the shell's light content, slotted into its navigation landmark.
        await expect(
          page.locator('a[slot="navigation"]', { hasText: "Home" }).first(),
        ).toBeVisible();
        // The footer lists the pages as well.
        const pages = page.getByRole("navigation", { name: "Site pages" });
        await expect(pages.getByRole("link", { name: "Home" })).toBeVisible();
        // Only the appearance panel needs a script; it is not offered, and the footer says why.
        await expect(page.getByRole("button", { name: "Appearance", exact: true })).toBeHidden();
        for (const surprise of await page.getByRole("button", { name: "Surprise me" }).all()) {
          await expect(surprise).toBeHidden();
        }
        await expect(page.getByText("The appearance panel needs JavaScript.")).toBeVisible();
        expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
      });
    }
  }
}
