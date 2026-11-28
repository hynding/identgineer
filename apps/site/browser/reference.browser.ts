import { COMPONENT_EXAMPLES } from "../src/examples/component-examples";
import { usageSnippet } from "../src/examples/component-example";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { COMPONENT_ROUTES, hydrated, sidewaysScroll } from "./pages";

test.describe("the index of the components", () => {
  test("links the page of every component, in groups, and nothing else in its tables", async ({
    page,
  }) => {
    await page.goto("/components/");
    await hydrated(page, "site-content-page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Components");
    const links = page.locator("article.prose td a");
    expect(
      await links.evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href"))),
    ).toEqual(expect.arrayContaining(COMPONENT_ROUTES.map((route) => route.path)));
    await expect(links).toHaveCount(COMPONENT_ROUTES.length);
    const headings = await page.locator("article.prose h2").allTextContents();
    expect(headings.length).toBeGreaterThan(5);
    expect(new Set(headings).size).toBe(headings.length);
  });

  test("leads to a component's page, which marks the index as its section", async ({ page }) => {
    await page.goto("/components/");
    await page.getByRole("link", { name: "idg-button", exact: true }).click();
    await expect(page).toHaveURL(/\/components\/idg-button\/$/);
    await expect(page.locator('a[slot="navigation"][href="/components/"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

test.describe("each component's page", () => {
  for (const route of COMPONENT_ROUTES) {
    const tag = route.content as keyof typeof COMPONENT_EXAMPLES;
    test(`${route.path} has its example and snippet, fits at 320 and 1440px and passes axe`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(route.path);
      await hydrated(page, "site-content-page");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(tag);
      const figure = page.locator("figure.example-component");
      await expect(figure).toHaveCount(1);
      const stage = figure.locator(".example-stage");
      const snippet = usageSnippet(COMPONENT_EXAMPLES[tag].nodes);
      await expect(figure.locator("figure.code-sample pre code")).toHaveText(snippet);
      // The snippet and the live example are one description: each tag of it is drawn.
      for (const name of new Set([...snippet.matchAll(/<([a-z][a-z0-9-]*)/g)].map((m) => m[1]))) {
        await expect(stage.locator(name ?? "")).not.toHaveCount(0);
      }
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("a component's page", () => {
  test("draws the live example in the page's current theme, design, layout and UX mode", async ({
    page,
  }) => {
    const look = async (query: string) => {
      await page.goto(`/components/idg-button/?${query}`);
      await hydrated(page, "site-content-page");
      return page
        .locator(".example-stage idg-button")
        .first()
        .evaluate((button) => {
          const style = getComputedStyle(button);
          const control = button.shadowRoot?.querySelector("button");
          const inner = control ? getComputedStyle(control) : style;
          return {
            background: inner.backgroundColor,
            radius: inner.borderTopLeftRadius,
            height: inner.minHeight,
          };
        });
    };
    const base = await look("idg-theme=aurora&idg-design=flat&idg-ux=comfortable");
    expect((await look("idg-theme=ember&idg-design=flat&idg-ux=comfortable")).background).not.toBe(
      base.background,
    );
    expect(
      (await look("idg-theme=aurora&idg-design=brutalist&idg-ux=comfortable")).radius,
    ).not.toBe(base.radius);
    expect((await look("idg-theme=aurora&idg-design=flat&idg-ux=power")).height).not.toBe(
      base.height,
    );
  });

  test("copies the usage snippet exactly, with the page's own copy button", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/components/idg-badge/");
    await hydrated(page, "site-content-page");
    await page.locator("figure.example-component idg-button.code-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      usageSnippet(COMPONENT_EXAMPLES["idg-badge"].nodes),
    );
  });

  test("opens a dialog's example from its own button, and closes it with Escape", async ({
    page,
  }) => {
    await page.goto("/components/idg-dialog/");
    await hydrated(page, "site-content-page");
    await page.getByRole("button", { name: "Open the dialog" }).click();
    await expect(page.getByRole("dialog", { name: "Discard the draft?" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Discard the draft?" })).toBeHidden();
  });

  test("scrolls a long table inside its own box on a narrow window, never the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/components/idg-input/");
    await hydrated(page, "site-content-page");
    const box = page.locator(".table-scroll").first();
    const [scrolls, client] = await box.evaluate((element) => [
      element.scrollWidth > element.clientWidth,
      element.clientWidth,
    ]);
    expect(scrolls).toBe(true);
    expect(client).toBeLessThanOrEqual(320);
    expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
  });

  test("never wraps a short code name, and wraps a long one only between its parts", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/components/idg-button/");
    await hydrated(page, "site-content-page");
    const names = await page.locator("td:first-child code").evaluateAll((codes) =>
      codes.map((code) => ({
        text: code.textContent,
        lines: code.getClientRects().length,
      })),
    );
    for (const { text, lines } of names) {
      if (text.length < 17) expect(lines, text).toBe(1);
    }
    expect(names.some(({ text }) => text === "accessibleControls")).toBe(true);
  });
});

test.describe("a component's page without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("reads: the example drawn, the snippet shown and no copy button offered", async ({
    page,
  }) => {
    await page.goto("/components/idg-button/");
    await expect(
      page.locator("figure.example-component .example-stage idg-button").first(),
    ).toBeVisible();
    await expect(page.locator("figure.code-sample pre")).toBeVisible();
    await expect(page.locator("idg-button.code-copy")).toBeHidden();
    await expect(page.locator("table").first()).toBeVisible();
  });
});
