import type { Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, SCHEMES, THEMES, UX_MODES, applyAxes, settle, type Axes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { inputOf, openIdentity, signInThroughForm } from "./identity-page";

const trigger = (page: Page) => page.locator("#menu").locator('[part="trigger"] button');
const menuSurface = (page: Page) => page.locator("#menu").locator('idg-menu [part="surface"]');

/** Every signed-out form showing its field errors and summary, as after an empty submit. */
async function showFormErrors(page: Page): Promise<void> {
  for (const host of ["#sign-in", "#register", "#reset-request", "#reset-complete"]) {
    await page.locator(host).locator("idg-button.submit button").click();
    await expect(page.locator(host).locator('idg-alert[part="error"]')).toBeVisible();
  }
}

/** Signed in, with the profile drawn and the account menu open. */
async function showAccount(page: Page): Promise<void> {
  await signInThroughForm(page);
  await expect(page.locator("#profile").locator('[part="session"]')).toHaveCount(1);
  await trigger(page).click();
  await expect(menuSurface(page)).toBeVisible();
}

/** Checks the signed-out forms with their errors, then the signed-in account, under `axes`. */
async function expectAccessibleUnder(page: Page, axes: Axes): Promise<void> {
  await openIdentity(page);
  await applyAxes(page, axes);
  await showFormErrors(page);
  await settle(page);
  await expectNoAxeViolations(page);
  await showAccount(page);
  await settle(page);
  await expectNoAxeViolations(page);
}

test.describe("identity components meet WCAG 2.2 AA", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`${design} ${scheme}`, async ({ page }) => {
        await expectAccessibleUnder(page, { design, scheme });
      });
    }
  }
  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      test(`the ${theme} theme, ${scheme}`, async ({ page }) => {
        await expectAccessibleUnder(page, { theme, scheme });
      });
    }
  }
  for (const ux of UX_MODES) {
    test(`the ${ux} UX mode`, async ({ page }) => {
      await expectAccessibleUnder(page, { ux });
    });
  }
  for (const layout of LAYOUTS) {
    test(`the ${layout} layout`, async ({ page }) => {
      await expectAccessibleUnder(page, { layout });
    });
  }

  test("a throttled form and a registration confirmation", async ({ page }) => {
    await openIdentity(page, "?confirm");
    // The registration first: the client holds back every credential request while throttled.
    await inputOf(page, "#register", "username").fill("grace");
    await inputOf(page, "#register", "email").fill("grace@example.com");
    await inputOf(page, "#register", "password").fill("a brand new passphrase");
    await inputOf(page, "#register", "password").press("Enter");
    await expect(page.locator("#register").locator('[part="confirmation"]')).toBeVisible();
    await page.evaluate(() => {
      const fixture = (
        window as unknown as {
          identityFixture: { api: { respondNext: (m: string, p: string, a: unknown) => void } };
        }
      ).identityFixture;
      fixture.api.respondNext("POST", "/api/auth/local", {
        status: 429,
        headers: { "Retry-After": "60" },
        body: {
          data: null,
          error: { status: 429, name: "RateLimitError", message: "", details: {} },
        },
      });
    });
    await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
    await inputOf(page, "#sign-in", "password").fill("a password");
    await inputOf(page, "#sign-in", "password").press("Enter");
    await expect(page.locator("#sign-in").locator('[part="throttle"]')).toBeVisible();
    await settle(page);
    await expectNoAxeViolations(page);
  });
});

test.describe("identity components right to left", () => {
  test("the forms start at the right and the account menu opens from its trigger's end", async ({
    page,
  }) => {
    await openIdentity(page);
    await page.locator("html").evaluate((element) => {
      element.setAttribute("dir", "rtl");
    });
    await showFormErrors(page);
    const field = await page.locator("#sign-in").locator("idg-field").first().boundingBox();
    const label = await page
      .locator("#sign-in")
      .locator("idg-field")
      .first()
      .locator("label")
      .boundingBox();
    if (!field || !label) throw new Error("the sign-in field is not laid out");
    expect(Math.abs(field.x + field.width - (label.x + label.width))).toBeLessThan(1.5);
    expect(label.x).toBeGreaterThan(field.x + 1);
    await showAccount(page);
    await settle(page);
    const button = await trigger(page).boundingBox();
    const surface = await menuSurface(page).boundingBox();
    if (!button || !surface) throw new Error("the account menu is not laid out");
    expect(Math.abs(surface.x - button.x)).toBeLessThan(1.5);
    await expectNoAxeViolations(page);
  });
});

test.describe("identity components with large text on a narrow screen", () => {
  /** How far the page scrolls sideways; 0 when it does not. */
  const overflow = (page: Page) =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  test("nothing scrolls sideways at 320px with the text doubled, signed out or in", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openIdentity(page);
    await page.locator("html").evaluate((element) => {
      element.style.fontSize = "200%";
    });
    await page.evaluate(() => document.fonts.ready);
    await showFormErrors(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await showAccount(page);
    await settle(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const surface = await menuSurface(page).boundingBox();
    if (!surface) throw new Error("the account menu is not laid out");
    expect(surface.x).toBeGreaterThanOrEqual(0);
    expect(surface.x + surface.width).toBeLessThanOrEqual(320);
  });
});
