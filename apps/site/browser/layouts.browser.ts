import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { LAYOUTS, PAGES, WIDTHS, hydrated, sidewaysScroll } from "./pages";

for (const { name, path, component } of PAGES) {
  for (const layout of LAYOUTS) {
    for (const width of WIDTHS) {
      test(`${name} in ${layout} at ${String(width)}px passes axe, fits and offers the switcher`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${path}?idg-layout=${layout}`);
        await hydrated(page, component);
        await expect(page.locator("html")).toHaveAttribute("data-layout", layout);
        expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
        const appearance = page.getByRole("button", { name: "Appearance", exact: true });
        await expect(appearance).toBeVisible();
        await appearance.click();
        await expect(page.getByRole("dialog", { name: "Appearance" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Appearance" })).toBeHidden();
        await expectNoAxeViolations(page);
      });
    }
  }
}
