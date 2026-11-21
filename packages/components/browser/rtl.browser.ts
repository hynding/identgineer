import type { Page } from "@playwright/test";
import { settle } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { openOverlays, wire } from "./overlay-page";

const surface = (page: Page, id: string) => page.locator(`#${id}`).locator('[part="surface"]');

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box of an element, or of the part of its shadow tree that `inner` selects. */
async function boxOf(page: Page, selector: string, inner?: string): Promise<Box> {
  const host = page.locator(selector);
  const box = await (inner === undefined ? host : host.locator(inner).first()).boundingBox();
  if (!box) throw new Error(`${selector} is not laid out`);
  return box;
}

/** Opens the overlays fixture with the element `scope` selects, the whole page by default, set right to left. */
async function openRightToLeft(page: Page, scope = "html"): Promise<void> {
  await openOverlays(page);
  await page.locator(scope).evaluate((element) => {
    element.setAttribute("dir", "rtl");
  });
}

function expectInsideViewport(page: Page, box: Box, label: string): void {
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  expect(box.x, label).toBeGreaterThanOrEqual(0);
  expect(box.y, label).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, label).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height, label).toBeLessThanOrEqual(viewport.height);
}

const right = (box: Box) => box.x + box.width;

async function setPlacement(page: Page, hostId: string, placement: string): Promise<void> {
  await page.locator(`#${hostId}`).evaluate((element, value) => {
    element.setAttribute("placement", value);
  }, placement);
}

test.describe("anchored overlays in a right-to-left page", () => {
  test("a bottom-start popover placed by CSS lines up with its trigger's right edge", async ({
    page,
  }) => {
    await openRightToLeft(page);
    await page.locator("#share-trigger").click();
    await settle(page);
    const trigger = await boxOf(page, "#share-trigger");
    const shown = await boxOf(page, "#share", '[part="surface"]');
    expect(Math.abs(right(shown) - right(trigger))).toBeLessThan(1.5);
    expectInsideViewport(page, shown, "share");
    await expectNoAxeViolations(page);
  });

  test("a bottom-start popover follows a right-to-left section in a left-to-right page", async ({
    page,
  }) => {
    await openRightToLeft(page, "#share");
    await page.locator("#share-trigger").click();
    await settle(page);
    const trigger = await boxOf(page, "#share-trigger");
    const shown = await boxOf(page, "#share", '[part="surface"]');
    expect(Math.abs(right(shown) - right(trigger))).toBeLessThan(1.5);
  });

  test("a bottom-end menu placed by CSS lines up with its trigger's left edge", async ({
    page,
  }) => {
    await openRightToLeft(page);
    await page.locator("#native-menu-trigger").click();
    await settle(page);
    const trigger = await boxOf(page, "#native-menu-trigger");
    const shown = await boxOf(page, "#native-menu", '[part="surface"]');
    expect(Math.abs(shown.x - trigger.x)).toBeLessThan(1.5);
    expectInsideViewport(page, shown, "native-menu");
    await expectNoAxeViolations(page);
  });

  test("a popover placed right of its trigger keeps its gap on the side facing the trigger", async ({
    page,
  }) => {
    await openRightToLeft(page);
    await setPlacement(page, "share", "right");
    await page.locator("#share-trigger").click();
    await settle(page);
    const trigger = await boxOf(page, "#share-trigger");
    const shown = await boxOf(page, "#share", '[part="surface"]');
    expect(shown.x - right(trigger)).toBeCloseTo(8, 0);
  });

  test("the script fallback lines a top-start popover up with its trigger's right edge", async ({
    page,
  }) => {
    await openRightToLeft(page);
    await setPlacement(page, "details", "top-start");
    await page.locator("#external-trigger").click();
    await expect(surface(page, "details")).toHaveAttribute("data-placement", "top-start");
    const trigger = await boxOf(page, "#external-trigger");
    const shown = await boxOf(page, "#details", '[part="surface"]');
    expect(Math.abs(right(shown) - right(trigger))).toBeLessThan(1.5);
    expectInsideViewport(page, shown, "details");
  });

  test("the script fallback lines a top-end popover up with its trigger's left edge", async ({
    page,
  }) => {
    await openRightToLeft(page);
    await setPlacement(page, "details", "top-end");
    await page.locator("#external-trigger").click();
    await expect(surface(page, "details")).toHaveAttribute("data-placement", "top-end");
    const trigger = await boxOf(page, "#external-trigger");
    const shown = await boxOf(page, "#details", '[part="surface"]');
    expect(Math.abs(shown.x - trigger.x)).toBeLessThan(1.5);
  });

  test("a tooltip sits centred on its trigger inside the viewport", async ({ page }) => {
    await openRightToLeft(page);
    await page.locator("#tip-trigger").hover();
    await expect(page.locator("#tip").locator('[part="tooltip"]')).toBeVisible();
    await settle(page);
    const trigger = await boxOf(page, "#tip-trigger");
    const shown = await boxOf(page, "#tip", '[part="tooltip"]');
    const middle = (box: Box) => box.x + box.width / 2;
    expect(Math.abs(middle(shown) - middle(trigger))).toBeLessThan(1.5);
    expectInsideViewport(page, shown, "tip");
    await expectNoAxeViolations(page);
  });
});

test.describe("idg-dialog in a right-to-left page", () => {
  test("sits inside the viewport with its close button at the inline end", async ({ page }) => {
    await openRightToLeft(page);
    await wire(page, "open-basic", "basic", "showModal");
    await page.locator("#open-basic").click();
    await settle(page);
    const shown = await boxOf(page, "#basic", "dialog");
    const close = await boxOf(page, "#basic", '[part="close"]');
    expectInsideViewport(page, shown, "basic");
    expect(close.x - shown.x).toBeLessThan(shown.width / 2);
    await expectNoAxeViolations(page);
  });
});

test.describe("idg-toast-region in a right-to-left page", () => {
  const POSITIONS = [
    "top-start",
    "top-center",
    "top-end",
    "bottom-start",
    "bottom-center",
    "bottom-end",
  ] as const;

  for (const width of [1280, 320]) {
    test(`keeps every position inside a ${String(width)}px viewport, centring the centre ones`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await openRightToLeft(page);
      await page.evaluate(async () => {
        // The module the www build serves, which TypeScript cannot resolve from here.
        const entry = "/build/index.esm.js";
        const library = (await import(entry)) as { toast: (options: unknown) => unknown };
        library.toast({ title: "Saved", duration: 0 });
      });
      await expect(page.locator("#toasts idg-toast.hydrated")).toHaveCount(1);
      for (const position of POSITIONS) {
        await page.locator("#toasts").evaluate((element, value) => {
          element.setAttribute("position", value);
        }, position);
        await settle(page);
        const shown = await boxOf(page, "#toasts idg-toast");
        expectInsideViewport(page, shown, position);
        const middle = shown.x + shown.width / 2;
        if (position.endsWith("center"))
          expect(Math.abs(middle - width / 2), position).toBeLessThan(2);
        // A narrow viewport is filled edge to edge, so only a wide one shows the side.
        if (width > 600 && position.endsWith("start"))
          expect(middle, position).toBeGreaterThan(width / 2);
        if (width > 600 && position.endsWith("end"))
          expect(middle, position).toBeLessThan(width / 2);
      }
      await expectNoAxeViolations(page);
    });
  }
});
