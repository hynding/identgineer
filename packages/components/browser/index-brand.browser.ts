import { CONTENT_SECURITY_POLICY, LOGO_CONTENT_SECURITY_POLICY } from "./content-security-policy";
import { expect, test } from "./fixtures";

test.describe("the index page's brand section", () => {
  test("draws both logos as images under the logo policy, with no violation", async ({ page }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`violation ${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    page.on("console", (message) => {
      if (message.text().startsWith("violation")) violations.push(message.text());
    });
    await page.goto("/index.html");
    await expect(page.locator("idg-brand-logo:not(.hydrated)")).toHaveCount(0);
    for (const id of ["brand-demo-logo", "brand-demo-mark"]) {
      const image = page.locator(`#${id}`).locator("img");
      await expect(image).toHaveCount(1);
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBeGreaterThan(0);
    }
    expect(violations).toEqual([]);
    page.removeAllListeners("console");
  });

  test("shows the guide and the export of the brand, with the files as text and no violation", async ({
    page,
  }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`violation ${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    page.on("console", (message) => {
      if (message.text().startsWith("violation")) violations.push(message.text());
    });
    await page.goto("/index.html");
    await expect(
      page.locator("idg-brand-guidelines:not(.hydrated), idg-brand-export:not(.hydrated)"),
    ).toHaveCount(0);
    const guide = page.locator("#brand-demo-guidelines");
    await expect(guide.locator("h2.name")).toHaveText("Harbour Lights");
    await expect(guide.locator("section")).toHaveCount(6);
    await expect(guide.locator("img")).toHaveCount(4);
    await expect.poll(() => guide.locator("idg-brand-logo").count()).toBe(4);
    const files = page.locator("#brand-demo-export");
    await expect(files.locator('[role="region"]')).toHaveCount(3);
    await expect(files.locator('[data-artefact="css"] code')).toContainText("--idg-color-accent");
    await expect(files.locator('[data-action="copy-css"]')).toHaveCount(1);
    await expect(files.locator('[data-action="download-tokens"]')).toHaveCount(1);
    expect(violations).toEqual([]);
    page.removeAllListeners("console");
  });

  test("edits the brand's kit and saves it to the page's own store, with no violation", async ({
    page,
  }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`violation ${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    page.on("console", (message) => {
      if (message.text().startsWith("violation")) violations.push(message.text());
    });
    await page.goto("/index.html");
    const editor = page.locator("#brand-demo-editor");
    await expect(page.locator("idg-brand-editor:not(.hydrated)")).toHaveCount(0);
    await expect(editor.getByRole("form", { name: "Harbour Lights brand kit" })).toHaveCount(1);
    await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(
      "Harbour Lights",
    );
    await expect(editor.locator("idg-brand-guidelines h3.name")).toHaveText("Harbour Lights");
    await expect
      .poll(() =>
        editor
          .locator("idg-brand-guidelines idg-brand-logo img")
          .evaluateAll((images) =>
            images.every((image) => image instanceof HTMLImageElement && image.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await editor.getByRole("textbox", { name: "Tagline" }).fill("Every ship comes home");
    await editor.getByRole("button", { name: "Save brand kit" }).press("Enter");
    await expect(editor.locator('idg-alert[part="saved"]')).toHaveText("Brand kit saved.");
    expect(violations).toEqual([]);
    page.removeAllListeners("console");
  });

  test("is served with the logo policy, and no other page is widened", async ({ page }) => {
    const policy = async (path: string) =>
      (await page.goto(path))?.headers()["content-security-policy"];
    expect(await policy("/index.html")).toBe(LOGO_CONTENT_SECURITY_POLICY);
    expect(await policy("/")).toBe(LOGO_CONTENT_SECURITY_POLICY);
    expect(await policy("/fixtures/variation-switcher.html")).toBe(CONTENT_SECURITY_POLICY);
  });
});
