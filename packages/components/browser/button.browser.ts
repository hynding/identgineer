import type { Page } from "@playwright/test";
import { DESIGNS, SCHEMES, UX_MODES, applyAxes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { CONTENT_SECURITY_POLICY } from "./content-security-policy";
import { expect, test } from "./fixtures";

const PAGE = "/fixtures/button.html";

/**
 * Opens the fixture once every button has hydrated. Until then a button is hidden and the page
 * reflows as each one draws, so a click aimed at it can land outside the viewport or miss.
 */
async function open(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.locator("idg-button:not(.hydrated)")).toHaveCount(0);
}

test.describe("idg-button hydration under the strict policy", () => {
  test("hydrates every button and applies its styles from a constructable stylesheet", async ({
    page,
  }) => {
    const response = await page.goto(PAGE);
    expect(response?.headers()["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
    const buttons = page.locator("idg-button");
    const total = await buttons.count();
    await expect(page.locator("idg-button.hydrated")).toHaveCount(total);

    const control = page.locator("#live-submit").locator("button");
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(24);
    const background = await control.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("idg-button in a form", () => {
  test("submit sends the form's values", async ({ page }) => {
    await open(page);
    await page.locator("#live input").fill("Lovelace");
    await page.locator("#live-submit").click();
    await expect(page).toHaveURL(/\?name=Lovelace$/);
  });

  test("reset restores the form's initial values", async ({ page }) => {
    await open(page);
    const input = page.locator("#live input");
    await input.fill("Changed");
    await page.locator("#live-reset").click();
    await expect(input).toHaveValue("Ada");
    expect(new URL(page.url()).search).toBe("");
  });

  test.describe("blocked", () => {
    for (const id of ["blocked-disabled", "blocked-loading"]) {
      test(`${id} does not submit`, async ({ page }) => {
        await open(page);
        await page.locator(`#${id}`).click({ force: true });
        await page.locator(`#${id}`).press("Enter");
        expect(new URL(page.url()).search).toBe("");
      });
    }

    test("a blocked click never reaches a listener on the host", async ({ page }) => {
      await open(page);
      const received = await page.evaluate(() => {
        const host = document.querySelector("#blocked-loading");
        let count = 0;
        host?.addEventListener("click", () => (count += 1));
        host?.shadowRoot?.querySelector("button")?.click();
        return count;
      });
      expect(received).toBe(0);
    });

    test("a loading button stays focusable and a disabled one does not", async ({ page }) => {
      await open(page);
      await page.locator("#blocked-loading").locator("button").focus();
      await expect(page.locator("#blocked-loading").locator("button")).toBeFocused();
      await page.locator("#blocked-disabled").locator("button").focus();
      await expect(page.locator("#blocked-disabled").locator("button")).not.toBeFocused();
    });
  });
});

test.describe("idg-button keyboard", () => {
  for (const key of ["Enter", "Space"]) {
    test(`${key} activates a submit button`, async ({ page }) => {
      await open(page);
      await page.locator("#live input").fill("Keys");
      await page.locator("#live-submit").locator("button").focus();
      await page.keyboard.press(key);
      await expect(page).toHaveURL(/\?name=Keys$/);
    });
  }

  test("tabs from the field to the button and shows a focus ring", async ({ page }) => {
    await open(page);
    await page.locator("#live input").focus();
    await page.keyboard.press("Tab");
    const control = page.locator("#live-submit").locator("button");
    await expect(control).toBeFocused();
    const outline = await control.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe("none");
  });
});

test.describe("idg-button unsafe href", () => {
  test("renders an inert link that goes nowhere", async ({ page }) => {
    await open(page);
    const link = page.locator("#unsafe-link").locator("a");
    await expect(link).not.toHaveAttribute("href", /.*/);
    await expect(link).toHaveAttribute("aria-disabled", "true");
    await link.click({ force: true });
    expect(page.url()).toContain(PAGE);
  });
});

test.describe("idg-button accessibility", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await open(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await open(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }
});
