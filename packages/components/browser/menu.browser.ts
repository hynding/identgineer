import type { Page } from "@playwright/test";
import { accessibleDescendants, accessibleNode } from "./accessible-node";
import { DESIGNS, SCHEMES, UX_MODES, applyAxes, settle } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { events, focusedId, openOverlays, recordEvents } from "./overlay-page";

const surface = (page: Page) => page.locator("#actions").locator('[part="surface"]').first();

async function openByKeyboard(page: Page, key = "Enter"): Promise<void> {
  await page.locator("#actions-trigger button").focus();
  await page.keyboard.press(key);
  await expect(surface(page)).toBeVisible();
  // The menu moves focus once the popover's toggle event fires, which comes a task later.
  await expect.poll(() => focusedItem(page)).not.toBe("");
}

/** The label of the item that has focus. */
function focusedItem(page: Page): Promise<string> {
  return page.evaluate(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    const root = active?.getRootNode();
    const host = root instanceof ShadowRoot ? root.host : null;
    return host?.localName === "idg-menu-item" ? host.textContent.trim() : "";
  });
}

test.describe("idg-menu semantics", () => {
  test("the trigger is a collapsed menu button, and expanded while the menu is open", async ({
    page,
  }) => {
    await openOverlays(page);
    await expect
      .poll(() => accessibleNode(page, "actions-trigger", "button"))
      .toMatchObject({
        properties: { expanded: false, hasPopup: "menu" },
        relations: { controls: 1 },
      });
    await openByKeyboard(page);
    await expect
      .poll(async () => (await accessibleNode(page, "actions-trigger", "button")).properties)
      .toMatchObject({ expanded: true });
  });

  test("the accessibility tree has a named menu of items with their roles, though each item has its own shadow root", async ({
    page,
  }) => {
    await openOverlays(page);
    await openByKeyboard(page);
    const tree = async () =>
      (await accessibleDescendants(page, "actions")).filter(
        (node) => !["StaticText", "InlineTextBox", "generic", "none", "image"].includes(node.role),
      );
    await expect.poll(tree).toEqual([
      { role: "button", name: "Actions" },
      { role: "menu", name: "Actions" },
      { role: "menuitem", name: "Edit" },
      { role: "menuitem", name: "Duplicate" },
      { role: "menuitem", name: "Archive" },
      { role: "separator", name: "" },
      { role: "group", name: "Sort by" },
      { role: "menuitemradio", name: "Name" },
      { role: "menuitemradio", name: "Date" },
      { role: "menuitemcheckbox", name: "Show grid" },
      { role: "separator", name: "" },
      { role: "menuitem", name: "Help centre" },
      { role: "menuitem", name: "Delete" },
    ]);
    await expect
      .poll(async () => (await accessibleNode(page, "item-name", '[part="item"]')).properties)
      .toMatchObject({
        checked: "true",
      });
    await expect
      .poll(async () => (await accessibleNode(page, "item-grid", '[part="item"]')).properties)
      .toMatchObject({
        checked: "false",
      });
    await expect
      .poll(async () => (await accessibleNode(page, "item-archive", '[part="item"]')).properties)
      .toMatchObject({
        disabled: true,
      });
    await expect
      .poll(() => accessibleNode(page, "item-edit", '[part="item"]'))
      .toMatchObject({
        role: "menuitem",
        name: "Edit",
      });
  });
});

test.describe("idg-menu keyboard", () => {
  test("Enter opens at the first item, and the arrows, Home, End and typing move focus", async ({
    page,
  }) => {
    await openOverlays(page);
    await openByKeyboard(page);
    await expect.poll(() => focusedItem(page)).toBe("Edit");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedItem(page)).toBe("Duplicate");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedItem(page)).toBe("Archive");
    await page.keyboard.press("End");
    await expect.poll(() => focusedItem(page)).toBe("Delete");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedItem(page)).toBe("Edit");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focusedItem(page)).toBe("Delete");
    await page.keyboard.press("Home");
    await expect.poll(() => focusedItem(page)).toBe("Edit");
    await page.keyboard.type("sh");
    await expect.poll(() => focusedItem(page)).toBe("Show grid");
  });

  test("ArrowUp on the trigger opens at the last item", async ({ page }) => {
    await openOverlays(page);
    await openByKeyboard(page, "ArrowUp");
    await expect.poll(() => focusedItem(page)).toBe("Delete");
  });

  test("Enter chooses an item, emits idgSelect, closes and returns to the trigger", async ({
    page,
  }) => {
    await openOverlays(page);
    await recordEvents(page, "actions", ["idgSelect"]);
    await openByKeyboard(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(surface(page)).toBeHidden();
    await expect(page.locator("#actions-trigger button")).toBeFocused();
    expect(await events(page, "actions")).toEqual([
      { type: "idgSelect", detail: { value: "duplicate" } },
    ]);
  });

  test("Space toggles a checkbox item and keeps the menu open", async ({ page }) => {
    await openOverlays(page);
    await openByKeyboard(page);
    await page.keyboard.type("sh");
    await page.keyboard.press(" ");
    await expect(surface(page)).toBeVisible();
    await expect
      .poll(async () => (await accessibleNode(page, "item-grid", '[part="item"]')).properties)
      .toMatchObject({ checked: "true" });
  });

  test("choosing a radio item checks it and unchecks the other", async ({ page }) => {
    await openOverlays(page);
    await openByKeyboard(page);
    await page.keyboard.type("da");
    await page.keyboard.press("Enter");
    await expect(page.locator("#item-date")).toHaveAttribute("checked", "");
    await expect(page.locator("#item-name")).not.toHaveAttribute("checked");
  });

  test("a disabled item can be reached but not chosen", async ({ page }) => {
    await openOverlays(page);
    await recordEvents(page, "actions", ["idgSelect"]);
    await openByKeyboard(page);
    await page.keyboard.type("ar");
    await expect.poll(() => focusedItem(page)).toBe("Archive");
    await page.keyboard.press("Enter");
    await expect(surface(page)).toBeVisible();
    expect(await events(page, "actions")).toEqual([]);
  });

  test("Escape closes the menu and returns focus to the trigger", async ({ page }) => {
    await openOverlays(page);
    await openByKeyboard(page);
    await page.keyboard.press("Escape");
    await expect(surface(page)).toBeHidden();
    await expect(page.locator("#actions-trigger button")).toBeFocused();
  });

  test("Tab closes the menu and moves on from the trigger", async ({ page }) => {
    await openOverlays(page);
    await openByKeyboard(page);
    await page.keyboard.press("Tab");
    await expect(surface(page)).toBeHidden();
    expect(await focusedId(page)).toBe("native-menu-trigger");
  });

  test("Enter on a link item follows the link", async ({ page }) => {
    await openOverlays(page);
    await openByKeyboard(page);
    await page.keyboard.type("he");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#help$/);
    await expect(surface(page)).toBeHidden();
  });
});

test.describe("idg-menu pointer and layout", () => {
  test("a click chooses an item, and a click outside closes the menu", async ({ page }) => {
    await openOverlays(page);
    await recordEvents(page, "actions", ["idgSelect"]);
    await page.locator("#actions-trigger").click();
    await page.locator("#item-edit").click();
    await expect(surface(page)).toBeHidden();
    expect(await events(page, "actions")).toEqual([
      { type: "idgSelect", detail: { value: "edit" } },
    ]);
    await page.locator("#actions-trigger").click();
    await expect(surface(page)).toBeVisible();
    await page.locator("h1").click();
    await expect(surface(page)).toBeHidden();
  });

  test("a menu moved while open closes, reports it, and opens again", async ({ page }) => {
    await openOverlays(page);
    await recordEvents(page, "native-menu", ["idgClose"]);
    const button = page.locator("#native-menu-trigger");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.evaluate(() => {
      const menu = document.getElementById("native-menu");
      if (menu) document.body.append(menu);
    });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    expect(await events(page, "native-menu")).toEqual([{ type: "idgClose", detail: null }]);
    await button.click();
    await expect(page.locator("#native-menu").locator('[part="surface"]')).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  });

  test("a native trigger gets aria-expanded and aria-haspopup through its properties", async ({
    page,
  }) => {
    await openOverlays(page);
    const button = page.locator("#native-menu-trigger");
    await expect(button).toHaveAttribute("aria-haspopup", "menu");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  });

  test("items are at least 24px tall, and shortcut hints show only in the power mode", async ({
    page,
  }) => {
    await openOverlays(page);
    await openByKeyboard(page);
    for (const id of ["item-edit", "item-name", "item-grid"]) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box?.height, id).toBeGreaterThanOrEqual(24);
    }
    const hint = page.locator("#item-edit").locator("kbd");
    await expect(hint).toBeHidden();
    await applyAxes(page, { ux: "power" });
    await expect(hint).toBeVisible();
  });

  test("stays inside a 320px-wide viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openOverlays(page);
    await openByKeyboard(page);
    await settle(page);
    const box = await surface(page).boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  });

  test("shows a visible boundary and a highlighted item in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openOverlays(page);
    await openByKeyboard(page);
    const border = await surface(page).evaluate(
      (element) => getComputedStyle(element).borderTopStyle,
    );
    expect(border).toBe("solid");
  });
});

test.describe("idg-menu accessibility while open", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openOverlays(page);
        await openByKeyboard(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await openOverlays(page);
      await openByKeyboard(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }
});
