import { expect, test } from "./fixtures";
import { MISSING_PATH, hydrated } from "./pages";

test.describe("the current page", () => {
  test("is marked in the header's navigation and in the footer's", async ({ page }) => {
    await page.goto("/");
    await hydrated(page, "site-home");
    const current = page.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(2);
    for (const link of await current.all()) {
      await expect(link).toHaveAttribute("href", "/");
    }
    await expect(
      page.getByRole("navigation", { name: "Site pages" }).getByRole("link", { name: "Home" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("is none on the 404 page, which is no page of the navigation", async ({ page }) => {
    await page.goto(MISSING_PATH);
    await hydrated(page, "site-not-found");
    await expect(page.locator("[aria-current]")).toHaveCount(0);
  });
});

test.describe("the skip link", () => {
  for (const path of ["/", MISSING_PATH]) {
    test(`is the first stop of Tab on ${path} and moves focus to the main content`, async ({
      page,
    }) => {
      await page.goto(path);
      await hydrated(page, path === "/" ? "site-home" : "site-not-found");
      await page.keyboard.press("Tab");
      const focused = () =>
        page.evaluate(() => {
          let active = document.activeElement;
          while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          return {
            tag: active?.localName ?? "",
            id: active?.id ?? "",
            text: active?.textContent.trim() ?? "",
            href: active?.getAttribute("href") ?? "",
          };
        });
      expect(await focused()).toMatchObject({ tag: "a", href: "#main" });
      expect((await focused()).text).toMatch(/skip/i);
      await page.keyboard.press("Enter");
      expect(await focused()).toMatchObject({ tag: "main", id: "main" });
    });
  }
});
