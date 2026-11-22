import type { Page } from "@playwright/test";
import { settle } from "./axes";
import { expect, test } from "./fixtures";

const PAGE = "/fixtures/identity-layout.html";
const FORMS = "idg-sign-in, idg-register, idg-password-reset";

async function open(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.locator("html[data-identity-ready]")).toHaveCount(1);
  await expect(
    page.locator(`:is(${FORMS}, idg-cluster, idg-session-guard):not(.hydrated)`),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (document.getElementById("dialog") as HTMLDialogElement).showModal();
    document.getElementById("popover")?.showPopover();
  });
  await settle(page);
}

/** Each form's case and width, and the width the identity measure resolves to. */
function widths(page: Page) {
  return page.evaluate((forms) => {
    const probe = document.createElement("div");
    document.body.append(probe);
    probe.style.inlineSize = "var(--idg-identity-measure, var(--idg-size-m))";
    const measure = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      measure,
      forms: Array.from(document.querySelectorAll(forms), (form) => {
        const box = form.getBoundingClientRect();
        return {
          name: `${form.closest("[data-case]")?.getAttribute("data-case") ?? "?"} ${form.localName}`,
          width: box.width,
          right: box.right,
        };
      }),
    };
  }, FORMS);
}

test.describe("identity forms in parents that size them by their content", () => {
  test("keep the identity measure as their width on a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    const { measure, forms } = await widths(page);
    expect(forms).toHaveLength(6);
    expect(measure).toBeGreaterThan(0);
    for (const form of forms) {
      expect(form.width, form.name).toBeGreaterThanOrEqual(measure * 0.95);
      expect(form.width, form.name).toBeLessThanOrEqual(measure * 1.05);
    }
  });

  test("fit a 320px screen without scrolling sideways", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await open(page);
    const { forms } = await widths(page);
    for (const form of forms) {
      expect(form.width, form.name).toBeGreaterThan(160);
      expect(form.right, form.name).toBeLessThanOrEqual(320);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  test("take a measure the page sets", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--idg-identity-measure", "25rem");
    });
    await settle(page);
    const { measure, forms } = await widths(page);
    expect(measure).toBe(400);
    for (const form of forms) expect(Math.round(form.width), form.name).toBe(400);
  });
});

test.describe("idg-session-guard in a flex row or a grid", () => {
  /** The boxes of a case's cards, relative to the case. */
  const cardBoxes = (page: Page, name: string) =>
    page.locator(`[data-case="${name}"]`).evaluate((container) => {
      const origin = container.getBoundingClientRect();
      return Array.from(container.querySelectorAll(".card"), (card) => {
        const box = card.getBoundingClientRect();
        return [box.x - origin.x, box.y - origin.y, box.width, box.height].map(Math.round);
      });
    });

  async function signIn(page: Page): Promise<void> {
    await page.evaluate(`window.identityFixture.client.signIn({
      identifier: "ada", password: window.identityFixture.password })`);
    await expect(page.locator('[data-case="guard-flex"] .card').first()).toBeVisible();
    await settle(page);
  }

  test("lays out what it shows as the parent's own items, as a twin without a guard", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await signIn(page);
    for (const layout of ["flex", "grid"]) {
      const twin = await cardBoxes(page, `twin-${layout}`);
      expect(twin).toHaveLength(3);
      expect(twin[0]?.[2], layout).toBeGreaterThan(200);
      expect(await cardBoxes(page, `guard-${layout}`), layout).toEqual(twin);
    }
  });

  test("adds no group, region or other node to the accessibility tree", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await signIn(page);
    for (const layout of ["flex", "grid"]) {
      expect(await page.locator(`[data-case="guard-${layout}"]`).ariaSnapshot(), layout).toBe(
        await page.locator(`[data-case="twin-${layout}"]`).ariaSnapshot(),
      );
    }
  });
});
