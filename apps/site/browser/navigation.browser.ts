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

test.describe("a docs guide", () => {
  test("is marked in the docs' own navigation, and its section in the site's", async ({ page }) => {
    await page.goto("/docs/theming/");
    await hydrated(page, "site-content-page");
    const docs = page.getByRole("navigation", { name: "Docs" });
    await expect(docs.locator('a[aria-current="page"]')).toHaveText("Theming guide");
    await expect(docs.locator("[aria-current]")).toHaveCount(1);
    await expect(page.locator('a[slot="navigation"][href="/docs/"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
    const pager = page.getByRole("navigation", { name: "Previous and next" });
    await expect(pager.locator('a[rel="prev"]')).toHaveAttribute("href", "/docs/getting-started/");
    await expect(pager.locator('a[rel="next"]')).toHaveAttribute("href", "/docs/security/");
  });
});

test.describe("a code sample's copy button", () => {
  test("copies the sample's text, exactly, and says so", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/docs/getting-started/");
    await hydrated(page, "site-content-page");
    const sample = page.locator("figure.code-sample").first();
    const code = await sample.locator("pre code").textContent();
    await sample.locator("idg-button.code-copy").click();
    await expect(page.locator(".reading-body > p[role=status]")).toHaveText(/^Copied the .+ sample\.$/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  });
});
