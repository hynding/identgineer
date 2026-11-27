import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { MISSING_PATH, hydrated } from "./pages";

const AXES = ["data-theme", "data-design", "data-layout", "data-ux", "data-scheme"] as const;

const CHOICE = {
  "data-theme": "ember",
  "data-design": "glass",
  "data-layout": "bento",
  "data-ux": "focus",
  "data-scheme": "dark",
} as const;

interface FirstPaint {
  /** The root's axis attributes when the body was first added, before anything could be painted. */
  atBody: Record<string, string | null> | null;
  /** The root's axis attributes in the first animation frame, which comes before the first paint. */
  atFirstFrame: Record<string, string | null> | null;
  /** Changes to the root's axis attributes after the body was added. */
  laterChanges: string[];
}

/**
 * Watches the root from the moment the document is created, so a test can tell whether the
 * visitor's choice was on the root before the body existed and whether anything changed it after.
 */
async function watchFirstPaint(page: Page): Promise<void> {
  await page.addInitScript((axes: readonly string[]) => {
    // The init script runs before the parser has made the root element, so it is looked up late.
    const read = () =>
      Object.fromEntries(axes.map((name) => [name, document.documentElement.getAttribute(name)]));
    const state: FirstPaint = { atBody: null, atFirstFrame: null, laterChanges: [] };
    (window as unknown as { __firstPaint: FirstPaint }).__firstPaint = state;
    let bodySeen = false;
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "childList" && !bodySeen) {
          if ([...record.addedNodes].some((node) => node.nodeName === "BODY")) {
            bodySeen = true;
            state.atBody = read();
          }
        } else if (
          record.type === "attributes" &&
          bodySeen &&
          record.target === document.documentElement
        ) {
          state.laterChanges.push(`${record.attributeName ?? ""}=${String(record.oldValue)}`);
        }
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [...axes],
      attributeOldValue: true,
    });
    requestAnimationFrame(() => {
      state.atFirstFrame = read();
    });
  }, AXES);
}

function firstPaint(page: Page): Promise<FirstPaint> {
  return page.evaluate(() => (window as unknown as { __firstPaint: FirstPaint }).__firstPaint);
}

function rootAxes(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(
    (axes) =>
      Object.fromEntries(axes.map((name) => [name, document.documentElement.getAttribute(name)])),
    AXES,
  );
}

async function openAppearance(page: Page) {
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Appearance" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Makes every choice through the switcher, as a visitor does: radios clicked, selects chosen. */
async function chooseEverything(page: Page): Promise<void> {
  const dialog = await openAppearance(page);
  // The switcher is the dialog element's light content, slotted into its shadow <dialog>.
  const switcher = page.locator("idg-dialog idg-variation-switcher");
  const field = (control: string) => switcher.locator(`idg-field[data-control="${control}"]`);
  await field("theme").locator(`idg-radio[value="${CHOICE["data-theme"]}"] input`).check();
  await field("design").locator("select").selectOption(CHOICE["data-design"]);
  await field("layout").locator("select").selectOption(CHOICE["data-layout"]);
  await field("ux").locator("select").selectOption(CHOICE["data-ux"]);
  await field("scheme").locator(`idg-radio[value="${CHOICE["data-scheme"]}"] input`).check();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

test.describe("the appearance panel", () => {
  test("changes all four axes and the scheme of the page", async ({ page }) => {
    await page.goto("/");
    await hydrated(page, "site-home");
    await chooseEverything(page);
    expect(await rootAxes(page)).toEqual(CHOICE);
  });

  test("returns focus to the button that opened it", async ({ page }) => {
    await page.goto("/");
    await hydrated(page, "site-home");
    await openAppearance(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Appearance", exact: true })).toBeFocused();
  });
});

test.describe("a visitor's choice", () => {
  test("survives navigation and reload, already on the root at the first paint", async ({
    page,
  }) => {
    await watchFirstPaint(page);
    await page.goto("/");
    await hydrated(page, "site-home");
    await chooseEverything(page);

    for (const open of [() => page.goto(MISSING_PATH), () => page.reload(), () => page.goto("/")]) {
      await open();
      await hydrated(page, page.url().endsWith(MISSING_PATH) ? "site-not-found" : "site-home");
      const paint = await firstPaint(page);
      expect(paint.atBody).toEqual(CHOICE);
      expect(paint.atFirstFrame).toEqual(CHOICE);
      expect(paint.laterChanges).toEqual([]);
      expect(await rootAxes(page)).toEqual(CHOICE);
    }
  });

  test("given in the URL is on the root at the first paint", async ({ page }) => {
    await watchFirstPaint(page);
    await page.goto("/?idg-theme=tidal&idg-layout=magazine");
    await hydrated(page, "site-home");
    const paint = await firstPaint(page);
    expect(paint.atBody).toMatchObject({ "data-theme": "tidal", "data-layout": "magazine" });
    expect(paint.laterChanges).toEqual([]);
  });
});

test.describe("Surprise me", () => {
  test("moves the page to another look, keeps the scheme, stores it and says what it is", async ({
    page,
  }) => {
    await page.goto("/?idg-scheme=dark");
    await hydrated(page, "site-home");
    const before = await rootAxes(page);
    await page.getByRole("button", { name: "Surprise me" }).first().click();
    const after = await rootAxes(page);
    expect(after).not.toEqual(before);
    expect(after["data-scheme"]).toBe("dark");
    for (const axis of ["data-theme", "data-design", "data-layout", "data-ux"] as const) {
      expect(after[axis]).not.toBeNull();
    }
    await expect(page.locator(".shuffle-status")).toHaveText(/^Now showing the .+ theme/);
    await page.reload();
    await hydrated(page, "site-home");
    expect(await rootAxes(page)).toMatchObject({
      "data-theme": after["data-theme"],
      "data-layout": after["data-layout"],
    });
  });
});
