import { expect, test } from "./fixtures";
import { openIdentity, signInThroughForm } from "./identity-page";

test.describe("identity components under the strict policy", () => {
  test("every identity component hydrates and the guard shows its fallback", async ({ page }) => {
    await openIdentity(page);
    await expect(page.locator("#guard-fallback")).toBeVisible();
    await expect(page.locator("#profile")).toBeHidden();
  });

  test("a sign-in by keyboard reaches every component", async ({ page }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    await expect(page.locator("#guard-fallback")).toBeHidden();
    await expect(page.locator("#profile")).toBeVisible();
  });
});
