import type { Locator, Page } from "@playwright/test";
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

/** The positions of those of the locator's elements that no inert ancestor holds, through shadow roots. */
function reachable(locator: Locator): Promise<number[]> {
  return locator.evaluateAll((elements) =>
    elements.flatMap((element, index) => {
      for (let node: Node | null = element; node;) {
        if (node instanceof Element && node.hasAttribute("inert")) return [];
        node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
      }
      return [index];
    }),
  );
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
        // A landmark is the page's own unless it is inside an inert example, which nothing can reach:
        // each page has one main and one main navigation of its own, and they are shown.
        for (const landmark of [
          page.getByRole("main"),
          page.getByRole("navigation", { name: "Main navigation" }),
        ]) {
          const mine = await reachable(landmark);
          expect(mine).toHaveLength(1);
          await expect(landmark.nth(mine[0] ?? 0)).toBeVisible();
        }
        await expect(page.getByRole("contentinfo")).toBeVisible();
        // A menu button needs a script to open; without one the header shows its links instead.
        await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
        // The links are the shell's light content, slotted into its navigation landmark.
        const home = page.locator('a[slot="navigation"]', { hasText: "Home" });
        const own = await reachable(home);
        expect(own).toHaveLength(1);
        await expect(home.nth(own[0] ?? 0)).toBeVisible();
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
