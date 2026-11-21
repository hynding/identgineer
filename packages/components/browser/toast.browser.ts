import type { Page } from "@playwright/test";
import { accessibleDescendants, accessibleNode } from "./accessible-node";
import { DESIGNS, SCHEMES, UX_MODES, applyAxes, settle } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { focusedId, openOverlays } from "./overlay-page";

interface ShowOptions {
  title: string;
  description?: string;
  variant?: string;
  duration?: number;
  /** Adds an action with this label, whose choice sets `window.chosen`. */
  action?: string;
}

/** Calls the library's `toast()` as a page script would, and keeps the handle in `window.handles`. */
async function showToast(page: Page, options: ShowOptions): Promise<void> {
  await page.evaluate(async ({ action, ...rest }) => {
    // The module the www build serves, which TypeScript cannot resolve from here.
    const entry = "/build/index.esm.js";
    const library = (await import(entry)) as {
      toast: (options: unknown) => { dismiss: () => void };
    };
    const scope = window as unknown as { chosen?: string; handles?: unknown[] };
    const handle = library.toast({
      ...rest,
      ...(action === undefined
        ? {}
        : { action: { label: action, onSelect: () => (scope.chosen = action) } }),
    });
    scope.handles = [...(scope.handles ?? []), handle];
  }, options);
  // Hydrated, so its countdown has started and its buttons can take focus.
  await expect(page.locator("#toasts idg-toast:not(.hydrated)")).toHaveCount(0);
}

const region = (page: Page) => page.locator("#toasts").locator('[part="region"]');
const toasts = (page: Page) => page.locator("#toasts idg-toast");
/** The toasts on show: hydrated, so their countdowns have started, and not waiting their turn. */
const shownToasts = (page: Page) => page.locator("#toasts idg-toast.hydrated:not([queued])");

function liveText(page: Page, politeness: "polite" | "assertive"): Promise<string> {
  return page
    .locator("#toasts")
    .locator(`[aria-live="${politeness}"]`)
    .evaluate((element) => element.textContent);
}

test.describe("idg-toast semantics", () => {
  test("the region is a named landmark holding toasts that are groups named by their heading", async ({
    page,
  }) => {
    await openOverlays(page);
    await showToast(page, { title: "Saved", description: "Your changes are live." });
    await expect(shownToasts(page)).toHaveCount(1);
    await expect
      .poll(() => accessibleNode(page, "toasts", '[part="region"]'))
      .toMatchObject({
        role: "region",
        name: "Notifications",
      });
    const tree = async () =>
      (await accessibleDescendants(page, "toasts")).filter(
        // The announcer's paragraphs come and go, so paragraphs are left out.
        (node) =>
          !["StaticText", "InlineTextBox", "generic", "none", "image", "paragraph"].includes(
            node.role,
          ),
      );
    await expect.poll(tree).toEqual([
      { role: "region", name: "Notifications" },
      { role: "group", name: "Saved" },
      { role: "button", name: "Dismiss" },
    ]);
  });

  test("announces a toast politely and a danger toast assertively, as text", async ({ page }) => {
    await openOverlays(page);
    await showToast(page, { title: "Saved", description: "<b>live</b>" });
    await expect.poll(() => liveText(page, "polite")).toBe("Saved<b>live</b>");
    expect(await liveText(page, "assertive")).toBe("");
    await showToast(page, { title: "Upload failed", variant: "danger" });
    await expect.poll(() => liveText(page, "assertive")).toBe("Upload failed");
  });

  test("does not take focus", async ({ page }) => {
    await openOverlays(page);
    await page.locator("#end").focus();
    await showToast(page, { title: "Saved", action: "Undo" });
    await expect(shownToasts(page)).toHaveCount(1);
    expect(await focusedId(page)).toBe("end");
  });
});

test.describe("idg-toast keyboard", () => {
  test("F8 moves focus to the region, Tab reaches the action, and Escape dismisses and returns", async ({
    page,
  }) => {
    await openOverlays(page);
    await showToast(page, { title: "Deleted", action: "Undo" });
    await page.locator("#end").focus();
    await page.keyboard.press("F8");
    await expect(region(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(toasts(page).locator('[part="action"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toasts(page)).toHaveCount(0);
    expect(await focusedId(page)).toBe("end");
  });

  test("choosing the action runs it and dismisses the toast", async ({ page }) => {
    await openOverlays(page);
    await showToast(page, { title: "Deleted", action: "Undo" });
    await expect(toasts(page).locator('[part="action"]')).toBeVisible();
    await page.keyboard.press("F8");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(toasts(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { chosen?: string }).chosen)).toBe(
      "Undo",
    );
  });

  test("Escape in a toast reached with Tab returns focus to where it came from", async ({
    page,
  }) => {
    await openOverlays(page);
    await showToast(page, { title: "Deleted", action: "Undo" });
    await page.locator("#end").focus();
    await page.keyboard.press("Tab");
    await expect(toasts(page).locator('[part="action"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toasts(page)).toHaveCount(0);
    await expect.poll(() => focusedId(page)).toBe("end");
  });

  test("Escape in a toast reached with no focus before returns focus to the last focused element", async ({
    page,
  }) => {
    await openOverlays(page);
    await showToast(page, { title: "Deleted", action: "Undo" });
    await page.locator("#end").focus();
    await page.locator("#end").blur();
    // Reached with a click, so the focus event has no element it came from.
    await toasts(page).locator('[part="action"]').focus();
    await page.keyboard.press("Escape");
    await expect(toasts(page)).toHaveCount(0);
    await expect.poll(() => focusedId(page)).toBe("end");
  });

  test("dismissing a focused toast moves focus to the next one", async ({ page }) => {
    await openOverlays(page);
    await showToast(page, { title: "First", action: "Undo" });
    await showToast(page, { title: "Second", action: "Undo" });
    await expect(shownToasts(page).locator('[part="action"]')).toHaveCount(2);
    await page.keyboard.press("F8");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Escape");
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page).locator('[part="action"]')).toBeFocused();
  });
});

test.describe("idg-toast timing", () => {
  test("goes after its duration, but not while the pointer rests on it", async ({ page }) => {
    await openOverlays(page);
    await showToast(page, { title: "Saved", duration: 800 });
    await toasts(page).hover();
    await page.waitForTimeout(1500);
    await expect(toasts(page)).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect(toasts(page)).toHaveCount(0);
  });

  test("does not go while focus is inside the region", async ({ page }) => {
    await openOverlays(page);
    await showToast(page, { title: "Saved", duration: 800 });
    await expect(toasts(page)).toBeVisible();
    await page.keyboard.press("F8");
    await page.waitForTimeout(1500);
    await expect(toasts(page)).toHaveCount(1);
    await page.locator("#end").focus();
    await expect(toasts(page)).toHaveCount(0);
  });

  test("stays until dismissed while the user prefers reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openOverlays(page);
    await showToast(page, { title: "Saved", duration: 500 });
    await page.waitForTimeout(1200);
    await expect(toasts(page)).toHaveCount(1);
  });

  test("goes after six seconds by default, but stays while it offers an action", async ({
    page,
  }) => {
    await page.clock.install();
    await openOverlays(page);
    await showToast(page, { title: "Saved" });
    await showToast(page, { title: "Deleted", action: "Undo" });
    await expect(shownToasts(page)).toHaveCount(2);
    // Real time passes between the steps too, so the clock is moved short of and past six seconds
    // with room to spare.
    await page.clock.runFor(5000);
    await expect(toasts(page)).toHaveCount(2);
    await page.clock.runFor(1500);
    await expect(toasts(page)).toHaveCount(1);
    await page.clock.runFor(60_000);
    await expect(toasts(page)).toHaveText(/Deleted/);
  });

  test("shows three at a time and brings the next one in as one goes", async ({ page }) => {
    await openOverlays(page);
    for (const title of ["One", "Two", "Three", "Four"]) {
      await showToast(page, { title, duration: 0 });
    }
    await expect(toasts(page)).toHaveCount(4);
    await expect(shownToasts(page)).toHaveCount(3);
    await expect(toasts(page).nth(3)).toBeHidden();
    await page.evaluate(() => {
      (window as unknown as { handles: { dismiss: () => void }[] }).handles[0]?.dismiss();
    });
    await expect(toasts(page)).toHaveCount(3);
    await expect(toasts(page).nth(2)).toBeVisible();
    await expect.poll(() => liveText(page, "polite")).toBe("Four");
  });
});

test.describe("idg-toast pointer and layout", () => {
  test("a sideways swipe dismisses it, and a short drag does not", async ({ page }) => {
    await openOverlays(page);
    await showToast(page, { title: "Saved", duration: 0 });
    // Measured once the toast has finished rising into place.
    await settle(page);
    const box = await toasts(page).boundingBox();
    if (!box) throw new Error("the toast has no box");
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y, { steps: 5 });
    await page.mouse.up();
    await expect(toasts(page)).toHaveCount(1);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 200, y, { steps: 10 });
    await page.mouse.up();
    await expect(toasts(page)).toHaveCount(0);
  });

  test("a flick whose release lands off the toast, with no move reported, dismisses it", async ({
    page,
  }) => {
    await openOverlays(page);
    await showToast(page, { title: "Saved", duration: 0 });
    // A busy machine can coalesce the moves of a quick flick, so the toast hears only the press
    // and then a release somewhere else on the page.
    await page.locator("#toasts idg-toast").evaluate((toast) => {
      const surface = toast.shadowRoot?.querySelector('[part="toast"]');
      const box = surface?.getBoundingClientRect();
      if (!surface || !box) throw new Error("the toast has no surface");
      const init = { bubbles: true, composed: true, pointerId: 7, clientY: box.y + 8 };
      surface.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: box.x + 40 }));
      document.body.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: box.x + 240 }));
    });
    await expect(toasts(page)).toHaveCount(0);
  });

  test("gathers at the corner it is told, and lets clicks through around the toasts", async ({
    page,
  }) => {
    await openOverlays(page);
    await showToast(page, { title: "Saved", duration: 0 });
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    let box = await toasts(page).boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(viewport.width - 40);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(viewport.height - 40);
    await page.locator("#toasts").evaluate((element) => {
      element.setAttribute("position", "top-center");
    });
    await settle(page);
    box = await toasts(page).boundingBox();
    expect(box?.y).toBeLessThan(40);
    const middle = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    expect(Math.abs(middle - viewport.width / 2)).toBeLessThan(2);
    const regionBox = await region(page).boundingBox();
    const gap = { x: (regionBox?.x ?? 0) + 4, y: (regionBox?.y ?? 0) + 4 };
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.localName, gap);
    expect(hit).not.toBe("idg-toast-region");
  });

  test("its buttons are at least 24px square", async ({ page }) => {
    await openOverlays(page);
    await showToast(page, { title: "Deleted", action: "Undo" });
    for (const name of ["action", "close"]) {
      const box = await toasts(page).locator(`[part="${name}"]`).boundingBox();
      expect(box?.width, name).toBeGreaterThanOrEqual(24);
      expect(box?.height, name).toBeGreaterThanOrEqual(24);
    }
  });

  test("stays inside a 320px-wide viewport, long words included", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openOverlays(page);
    await showToast(page, {
      title: "Saved",
      description: "https://example.com/a/very/long/address/that/does/not/break/on/its/own",
      action: "Undo",
    });
    await settle(page);
    const box = await toasts(page).boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  });

  test("shows a visible boundary in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openOverlays(page);
    await showToast(page, { title: "Saved" });
    const border = await toasts(page)
      .locator('[part="toast"]')
      .evaluate((element) => getComputedStyle(element).borderTopStyle);
    expect(border).toBe("solid");
  });
});

async function showEveryVariant(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.getElementById("toasts") as unknown as { max: number }).max = 5;
  });
  for (const variant of ["neutral", "info", "success", "warning", "danger"]) {
    await showToast(page, {
      title: `A ${variant} toast`,
      description: "With a description",
      variant,
      duration: 0,
      ...(variant === "warning" ? { action: "Undo" } : {}),
    });
  }
  await expect(shownToasts(page)).toHaveCount(5);
}

test.describe("idg-toast accessibility while shown", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openOverlays(page);
        await showEveryVariant(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await openOverlays(page);
      await showEveryVariant(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }
});
