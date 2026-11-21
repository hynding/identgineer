import type { Page } from "@playwright/test";
import { accessibleNode } from "./accessible-node";
import { DESIGNS, SCHEMES, UX_MODES, applyAxes, settle } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { openOverlays } from "./overlay-page";

const hint = (page: Page, id: string) => page.locator(`#${id}`).locator('[part="tooltip"]');

async function focusByKeyboard(page: Page, id: string): Promise<void> {
  await page.locator("#external-trigger").focus();
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Tab");
    const reached = await page.evaluate(
      (target) => document.activeElement?.closest(`#${target}`) !== null,
      id,
    );
    if (reached) return;
  }
  throw new Error(`Tab never reached #${id}`);
}

test.describe("idg-tooltip", () => {
  test("describes an idg-button trigger across the shadow boundary, through the field protocol", async ({
    page,
  }) => {
    await openOverlays(page);
    await expect
      .poll(() => accessibleNode(page, "tip-trigger", "button"))
      .toMatchObject({
        role: "button",
        name: "Copy",
        description: "Copies the link to the clipboard",
      });
  });

  test("describes a native trigger with aria-description", async ({ page }) => {
    await openOverlays(page);
    await expect(page.locator("#tip-native-trigger")).toHaveAttribute(
      "aria-description",
      "Opens in a new tab",
    );
    await expect
      .poll(() => accessibleNode(page, "tip-native-trigger", ""))
      .toMatchObject({
        role: "button",
        name: "Preview",
        description: "Opens in a new tab",
      });
  });

  test("shows on keyboard focus and hides on Escape, keeping focus on the trigger", async ({
    page,
  }) => {
    await openOverlays(page);
    await focusByKeyboard(page, "tip-native");
    await expect(hint(page, "tip-native")).toBeVisible();
    const trigger = await page.locator("#tip-native-trigger").boundingBox();
    const shown = await hint(page, "tip-native").boundingBox();
    expect(shown?.y).toBeGreaterThanOrEqual((trigger?.y ?? 0) + (trigger?.height ?? 0));
    await page.keyboard.press("Escape");
    await expect(hint(page, "tip-native")).toBeHidden();
    await expect(page.locator("#tip-native-trigger")).toBeFocused();
  });

  test("hides on blur", async ({ page }) => {
    await openOverlays(page);
    await focusByKeyboard(page, "tip-native");
    await expect(hint(page, "tip-native")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(hint(page, "tip-native")).toBeHidden();
  });

  test("shows after the hover delay, stays while the pointer is over it, hides when it leaves", async ({
    page,
  }) => {
    await openOverlays(page);
    await page.locator("#tip-trigger").hover();
    await page.waitForTimeout(200);
    await expect(hint(page, "tip")).toBeHidden();
    await expect(hint(page, "tip")).toBeVisible();
    const box = await hint(page, "tip").boundingBox();
    if (!box) throw new Error("no tooltip");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await page.waitForTimeout(600);
    await expect(hint(page, "tip")).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(hint(page, "tip")).toBeHidden();
  });

  test("Escape hides a hover tooltip without moving the pointer", async ({ page }) => {
    await openOverlays(page);
    await page.locator("#tip-trigger").hover();
    await expect(hint(page, "tip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(hint(page, "tip")).toBeHidden();
  });

  test("hides when the page scrolls", async ({ page }) => {
    await openOverlays(page);
    await focusByKeyboard(page, "tip-native");
    await expect(hint(page, "tip-native")).toBeVisible();
    await page.mouse.wheel(0, 200);
    await expect(hint(page, "tip-native")).toBeHidden();
  });

  test("does not move for a user who prefers reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openOverlays(page);
    await focusByKeyboard(page, "tip-native");
    const moving = await hint(page, "tip-native").evaluate((element) =>
      element
        .getAnimations()
        .map((animation) => (animation as CSSTransition).transitionProperty)
        .includes("translate"),
    );
    expect(moving).toBe(false);
  });

  test("stays inside a 320px-wide viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openOverlays(page);
    await focusByKeyboard(page, "tip-native");
    await settle(page);
    const box = await hint(page, "tip-native").boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  });
});

test.describe("idg-tooltip on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a tap does not show it over the control", async ({ page }) => {
    await openOverlays(page);
    await page.locator("#tip-native-trigger").tap();
    await page.waitForTimeout(800);
    await expect(hint(page, "tip-native")).toBeHidden();
  });
});

test.describe("idg-tooltip accessibility while shown", () => {
  const showTip = async (page: Page) => {
    await openOverlays(page);
    await focusByKeyboard(page, "tip-native");
    await settle(page);
  };

  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await showTip(page);
        await applyAxes(page, { design, scheme });
        await expect(hint(page, "tip-native")).toBeVisible();
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await showTip(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }
});
