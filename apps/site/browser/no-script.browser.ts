import { expect, test } from "./fixtures";
import { PAGES, WIDTHS, sidewaysScroll } from "./pages";

test.use({ javaScriptEnabled: false });

for (const { name, path } of PAGES) {
  for (const width of WIDTHS) {
    test(`${name} reads and navigates without JavaScript at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      // The footer always lists the pages, whatever the header has collapsed.
      const pages = page.getByRole("navigation", { name: "Site pages" });
      await expect(pages.getByRole("link", { name: "Home" })).toBeVisible();
      // Only the appearance panel needs a script; it is not offered, and the footer says why.
      await expect(page.getByRole("button", { name: "Appearance", exact: true })).toBeHidden();
      await expect(page.getByText("The appearance panel needs JavaScript.")).toBeVisible();
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
    });
  }
}
