import type { Page } from "@playwright/test";
import { accessibleNode } from "./accessible-node";
import { DESIGNS, SCHEMES, UX_MODES, applyAxes, settle } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { focusIsWithin, openOverlays } from "./overlay-page";

const surface = (page: Page, id: string) => page.locator(`#${id}`).locator('[part="surface"]');

async function boxes(page: Page, hostId: string, triggerSelector: string) {
  const trigger = await page.locator(triggerSelector).boundingBox();
  const shown = await surface(page, hostId).boundingBox();
  if (!trigger || !shown) throw new Error("not laid out");
  return { trigger, shown };
}

test.describe("idg-popover", () => {
  test("a click on the trigger opens it in the top layer and marks the trigger expanded", async ({
    page,
  }) => {
    await openOverlays(page);
    const before = await accessibleNode(page, "share-trigger", "button");
    expect(before.properties).toMatchObject({ expanded: false });
    expect(before.relations).toMatchObject({ controls: 1 });
    await page.locator("#share-trigger").click();
    await expect(surface(page, "share")).toBeVisible();
    expect(
      await surface(page, "share").evaluate((element) => element.matches(":popover-open")),
    ).toBe(true);
    expect((await accessibleNode(page, "share-trigger", "button")).properties).toMatchObject({
      expanded: true,
    });
    expect(await focusIsWithin(page, "share")).toBe(true);
  });

  test("sits below its trigger, anchored by CSS", async ({ page }) => {
    await openOverlays(page);
    await page.locator("#share-trigger").click();
    await settle(page);
    const { trigger, shown } = await boxes(page, "share", "#share-trigger");
    expect(shown.y).toBeGreaterThanOrEqual(trigger.y + trigger.height);
    expect(Math.abs(shown.x - trigger.x)).toBeLessThan(2);
    expect(await surface(page, "share").getAttribute("class")).toContain("anchored");
  });

  test("Escape closes it and returns focus to the trigger", async ({ page }) => {
    await openOverlays(page);
    await page.locator("#share-trigger").click();
    await expect(surface(page, "share")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(surface(page, "share")).toBeHidden();
    await expect(page.locator("#share-trigger button")).toBeFocused();
    expect((await accessibleNode(page, "share-trigger", "button")).properties).toMatchObject({
      expanded: false,
    });
  });

  test("Tab moves through its content", async ({ page }) => {
    await openOverlays(page);
    await page.locator("#share-trigger").click();
    await page.keyboard.press("Tab");
    await expect(page.locator("#share-link")).toBeFocused();
  });

  test("a click outside closes it, and a second click on the trigger closes rather than reopens", async ({
    page,
  }) => {
    await openOverlays(page);
    await page.locator("#share-trigger").click();
    await expect(surface(page, "share")).toBeVisible();
    await page.locator("h1").click();
    await expect(surface(page, "share")).toBeHidden();
    await page.locator("#share-trigger").click();
    await expect(surface(page, "share")).toBeVisible();
    await page.locator("#share-trigger").click();
    await expect(surface(page, "share")).toBeHidden();
  });

  test("a trigger named by for opens it, and the script fallback places it above", async ({
    page,
  }) => {
    await openOverlays(page);
    await page.locator("#external-trigger").click();
    await expect(surface(page, "details")).toBeVisible();
    await expect(page.locator("#external-trigger")).toHaveAttribute("aria-expanded", "true");
    const { trigger, shown } = await boxes(page, "details", "#external-trigger");
    expect(shown.y + shown.height).toBeLessThanOrEqual(trigger.y + 1);
    await expect(surface(page, "details")).toHaveAttribute("data-placement", "top");
    await page.keyboard.press("Escape");
    await expect(page.locator("#external-trigger")).toBeFocused();
    await expect(page.locator("#external-trigger")).toHaveAttribute("aria-expanded", "false");
  });

  test("the script fallback flips below when there is no room above", async ({ page }) => {
    await openOverlays(page);
    await page.evaluate(() => {
      document.getElementById("external-trigger")?.scrollIntoView({ block: "start" });
    });
    await page.locator("#external-trigger").click();
    await expect(surface(page, "details")).toHaveAttribute("data-placement", "bottom");
  });

  test("stays inside a 320px-wide viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openOverlays(page);
    for (const [trigger, host] of [
      ["#share-trigger", "share"],
      ["#external-trigger", "details"],
    ] as const) {
      await page.locator(trigger).click();
      await settle(page);
      const box = await surface(page, host).boundingBox();
      expect(box?.x, host).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0), host).toBeLessThanOrEqual(320);
      await page.keyboard.press("Escape");
    }
  });

  test("shows a visible boundary in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openOverlays(page);
    await page.locator("#share-trigger").click();
    const style = await surface(page, "share").evaluate((element) => {
      const computed = getComputedStyle(element);
      return [computed.borderTopStyle, computed.borderTopWidth];
    });
    expect(style).toEqual(["solid", "2px"]);
  });
});

test.describe("idg-popover accessibility while open", () => {
  const openShare = async (page: Page) => {
    await openOverlays(page);
    await page.locator("#share-trigger").click();
    await settle(page);
  };

  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openShare(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await openShare(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }
});
