import type { Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, SCHEMES, THEMES, UX_MODES, applyAxes, settle, type Axes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import {
  banner,
  bannerButton,
  bannerRegion,
  inlinePanel,
  modalPanel,
  openConsent,
  switchIn,
} from "./consent-page";
import { expect, test } from "./fixtures";

/** The width, height and the styles that make a button as prominent as it looks. */
interface Look {
  width: number;
  height: number;
  top: number;
  variant: string | null;
  size: string | null;
  style: string;
}

async function lookOf(page: Page, name: "decline" | "accept"): Promise<Look> {
  const host = banner(page).locator(`idg-button.${name}`);
  const button = bannerButton(page, name);
  const box = await button.boundingBox();
  if (!box) throw new Error("the button is not laid out");
  return {
    width: box.width,
    height: box.height,
    top: box.y,
    variant: await host.getAttribute("variant"),
    size: await host.getAttribute("size"),
    style: await button.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        style.backgroundColor,
        style.color,
        style.fontSize,
        style.fontWeight,
        style.borderTopWidth,
        style.borderTopStyle,
        style.borderTopColor,
        style.minHeight,
        style.boxShadow,
      ].join(" | ");
    }),
  };
}

/** Accept and Decline, as numbers: one variant, one size, one look, within a pixel. */
async function expectEqualProminence(page: Page, context: string): Promise<void> {
  const decline = await lookOf(page, "decline");
  const accept = await lookOf(page, "accept");
  expect(accept.variant, `${context}: variant`).toBe(decline.variant);
  expect(accept.size, `${context}: size`).toBe(decline.size);
  expect(accept.style, `${context}: computed style`).toBe(decline.style);
  expect(Math.abs(accept.width - decline.width), `${context}: width`).toBeLessThanOrEqual(1);
  // Side by side they are one height; stacked, each fits its own words, which wrap differently.
  const sameRow = Math.abs(accept.top - decline.top) <= 1;
  if (sameRow) {
    expect(Math.abs(accept.height - decline.height), `${context}: height`).toBeLessThanOrEqual(1);
  }
}

async function expectAccessibleUnder(page: Page, axes: Axes): Promise<void> {
  await openConsent(page);
  await applyAxes(page, axes);
  await settle(page);
  await expectNoAxeViolations(page);
  await expectEqualProminence(page, JSON.stringify(axes));
  // The preferences in a dialog, the page behind it inert.
  await bannerButton(page, "choose").click();
  await expect(modalPanel(page).locator("idg-dialog dialog")).toBeVisible();
  await settle(page);
  await expectNoAxeViolations(page);
}

test.describe("consent components meet WCAG 2.2 AA", () => {
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

  test("under a privacy signal: the note, and the preferences that name it", async ({ page }) => {
    await openConsent(page, { gpc: true, query: "?announce" });
    await settle(page);
    await expectNoAxeViolations(page);
    await expect(inlinePanel(page).locator('[part="signal"]')).toBeVisible();
  });

  test("with the error alerts and the erase confirmation showing", async ({ page }) => {
    await openConsent(page);
    await page.evaluate(`(() => {
      const consent = window.consentFixture.tracker.consent;
      const broken = { ...consent, deny() { return false; }, grant() { return false; } };
      document.getElementById("banner").consent = broken;
      document.getElementById("prefs").consent = broken;
    })()`);
    await bannerButton(page, "decline").click();
    await expect(banner(page).locator('[part="error"]')).toBeVisible();
    await switchIn(inlinePanel(page), "analytics").check();
    await expect(switchIn(inlinePanel(page), "analytics")).toBeChecked();
    await inlinePanel(page).locator("idg-button.save button").click();
    await expect(inlinePanel(page).locator('[part="error"]')).toBeVisible();
    await inlinePanel(page).locator("idg-button.erase button").click();
    await expect(banner(page).locator('[part="error"]')).toBeVisible();
    await expect(inlinePanel(page).locator('[part="error"]')).toBeVisible();
    await expect(inlinePanel(page).locator('[part="confirm"]')).toBeVisible();
    await settle(page);
    await expectNoAxeViolations(page);
  });
});

test.describe("the choices are equally prominent", () => {
  for (const design of DESIGNS) {
    test(`Accept and Decline look the same in the ${design} design, hovered or not`, async ({
      page,
    }) => {
      await openConsent(page);
      await applyAxes(page, { design });
      await expectEqualProminence(page, design);
      await bannerButton(page, "accept").hover();
      await settle(page);
      const hovered = await lookOf(page, "accept");
      await bannerButton(page, "decline").hover();
      await settle(page);
      const other = await lookOf(page, "decline");
      expect(hovered.style).toBe(other.style);
    });
  }

  test("a bar and an inline banner give them the same size", async ({ page }) => {
    await openConsent(page);
    await expectEqualProminence(page, "bottom");
    await banner(page).evaluate((element) => {
      element.setAttribute("placement", "inline");
    });
    await expectEqualProminence(page, "inline");
  });
});

test.describe("consent components right to left", () => {
  test("Decline stays first, so it sits at the start edge, and nothing is mirrored wrongly", async ({
    page,
  }) => {
    await openConsent(page);
    await page.locator("html").evaluate((element) => {
      element.setAttribute("dir", "rtl");
    });
    await settle(page);
    const decline = await bannerButton(page, "decline").boundingBox();
    const accept = await bannerButton(page, "accept").boundingBox();
    if (!decline || !accept) throw new Error("the buttons are not laid out");
    expect(decline.x).toBeGreaterThan(accept.x);
    await expectEqualProminence(page, "rtl");
    await expectNoAxeViolations(page);
    const message = await banner(page)
      .locator('[part="message"]')
      .evaluate((element) => getComputedStyle(element).direction);
    expect(message).toBe("rtl");
  });
});

test.describe("consent components with large text on a narrow screen", () => {
  const overflow = (page: Page) =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  UX_MODES.forEach((ux, index) => {
    const design = DESIGNS[(index + 3) % DESIGNS.length] ?? "flat";
    const layout = LAYOUTS[(index + 5) % LAYOUTS.length] ?? "top-bar";
    test(`nothing scrolls sideways or is clipped at 320px with the text doubled, in the ${ux} UX mode (${design}, ${layout})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openConsent(page);
      await applyAxes(page, { ux, design, layout });
      await page.locator("html").evaluate((element) => {
        element.style.fontSize = "200%";
      });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // The bar may scroll within itself on a screen this small; the choices are reached there.
      await bannerButton(page, "accept").scrollIntoViewIfNeeded();
      await bannerButton(page, "decline").scrollIntoViewIfNeeded();
      await expectEqualProminence(page, `${ux} 320px`);
      const region = await bannerRegion(page).boundingBox();
      for (const name of ["decline", "accept", "choose"] as const) {
        await bannerButton(page, name).scrollIntoViewIfNeeded();
        const box = await bannerButton(page, name).boundingBox();
        if (!region || !box) throw new Error("the banner is not laid out");
        expect(box.x, `${name} starts inside the banner`).toBeGreaterThanOrEqual(region.x - 0.5);
        expect(box.x + box.width, `${name} ends inside the banner`).toBeLessThanOrEqual(
          region.x + region.width + 0.5,
        );
        expect(box.width, `${name} is not squeezed`).toBeGreaterThan(40);
      }
      // The bar holds to half the window, so the page behind it is still there to read.
      expect(region?.height ?? 0).toBeLessThanOrEqual(640 / 2 + 1);
      await switchIn(inlinePanel(page), "analytics").scrollIntoViewIfNeeded();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await bannerButton(page, "choose").click();
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expectNoAxeViolations(page);
    });
  });
});

test.describe("consent components in forced colours and with reduced motion", () => {
  test("the banner and its buttons keep an edge in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openConsent(page);
    const edge = await bannerRegion(page).evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: Number.parseFloat(style.borderTopWidth), style: style.borderTopStyle };
    });
    expect(edge.width).toBeGreaterThan(0);
    expect(edge.style).not.toBe("none");
    for (const name of ["decline", "accept", "choose"] as const) {
      const control = await bannerButton(page, name).evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: Number.parseFloat(style.borderTopWidth), style: style.borderTopStyle };
      });
      expect(control.width, name).toBeGreaterThan(0);
      expect(control.style, name).not.toBe("none");
    }
    await expect(switchIn(inlinePanel(page), "analytics")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("nothing in the banner or the panel animates with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openConsent(page);
    await bannerButton(page, "accept").hover();
    const running = await page.evaluate(() => {
      const roots: (Document | ShadowRoot)[] = [document];
      for (const root of roots) {
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }
      return roots
        .flatMap((root) => root.getAnimations())
        .filter(
          (animation) => animation instanceof CSSAnimation && animation.playState === "running",
        ).length;
    });
    expect(running).toBe(0);
  });
});

test.describe("the target size", () => {
  test("every control is at least 24px by 24px", async ({ page }) => {
    await openConsent(page);
    for (const name of ["decline", "accept", "choose"] as const) {
      const box = await bannerButton(page, name).boundingBox();
      expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(24);
    }
    for (const control of [
      inlinePanel(page).locator("idg-switch.analytics"),
      inlinePanel(page).locator("idg-button.save button"),
      inlinePanel(page).locator("idg-button.erase button"),
    ]) {
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    }
  });
});
