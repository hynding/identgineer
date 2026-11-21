import type { Page } from "@playwright/test";
import { accessibleDescendants, accessibleNode } from "./accessible-node";
import { expectNoAxeViolations } from "./accessibility";
import { DESIGNS, SCHEMES, UX_MODES, applyAxes } from "./axes";
import { expect, test } from "./fixtures";
import {
  NAVIGATION_PAGE,
  openNavigation,
  paginationControls,
  selectedTabs,
} from "./navigation-page";
import { events, focusedId, recordEvents } from "./overlay-page";

const STRUCTURE = ["StaticText", "InlineTextBox", "generic", "none", "image", "LineBreak"];

// The focused element in the light DOM: the accordion item rather than the button inside it.
const activeHostId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? "");

async function tree(page: Page, id: string, roles: string[]) {
  return (await accessibleDescendants(page, id)).filter((node) => roles.includes(node.role));
}

test.describe("idg-breadcrumb", () => {
  test("is a named navigation landmark holding a list, with the last item as the current page", async ({
    page,
  }) => {
    await openNavigation(page);
    await expect
      .poll(async () =>
        (await accessibleDescendants(page, "crumbs")).filter(
          (node) => !STRUCTURE.includes(node.role) || node.role === "StaticText",
        ),
      )
      .toEqual([
        { role: "navigation", name: "You are here" },
        { role: "list", name: "" },
        { role: "listitem", name: "" },
        { role: "link", name: "Home" },
        { role: "StaticText", name: "Home" },
        { role: "listitem", name: "" },
        { role: "link", name: "Docs" },
        { role: "StaticText", name: "Docs" },
        { role: "listitem", name: "" },
        { role: "link", name: "Components" },
        { role: "StaticText", name: "Components" },
        { role: "listitem", name: "" },
        { role: "StaticText", name: "Tabs" },
      ]);
    await expect(page.locator("#crumb-tabs").locator('[part="link"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("hides the separators from assistive technology", async ({ page }) => {
    await openNavigation(page);
    const separators = await page
      .locator("#crumb-home")
      .evaluate((item) =>
        item.shadowRoot?.querySelector('[part="separator"]')?.getAttribute("aria-hidden"),
      );
    expect(separators).toBe("true");
    await expect.poll(() => tree(page, "crumb-home", ["image"])).toEqual([]);
  });

  test("links are at least 24px tall and keyboard operable", async ({ page }) => {
    await openNavigation(page);
    const box = await page.locator("#crumb-home").locator("a").boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(24);
    await page.locator("#crumb-home").locator("a").focus();
    await page.keyboard.press("Tab");
    expect(await focusedId(page)).toBe("crumb-docs");
  });
});

test.describe("idg-tabs semantics", () => {
  test("a tab list of named tabs, each controlling its panel, and a panel named by its tab", async ({
    page,
  }) => {
    await openNavigation(page);
    await expect
      .poll(() => tree(page, "tabs", ["tablist", "tab", "tabpanel"]))
      .toEqual([
        { role: "tablist", name: "Project views" },
        { role: "tab", name: "Overview" },
        { role: "tab", name: "Activity" },
        { role: "tab", name: "Settings" },
        { role: "tab", name: "Billing" },
        { role: "tabpanel", name: "Overview" },
      ]);
    await expect
      .poll(() => accessibleNode(page, "tab-overview", ""))
      .toMatchObject({ role: "tab", properties: { selected: true }, relations: { controls: 1 } });
    await expect
      .poll(async () => (await accessibleNode(page, "tab-activity", "")).properties)
      .toMatchObject({ selected: false });
    await expect
      .poll(async () => (await accessibleNode(page, "tab-settings", "")).properties)
      .toMatchObject({ disabled: true });
  });

  test("the selected tab is the one tab stop, and the panel is one only when it holds nothing focusable", async ({
    page,
  }) => {
    await openNavigation(page);
    await page.locator("#before-tabs").focus();
    await page.keyboard.press("Shift+Tab");
    await page.locator("#tab-overview").focus();
    await page.keyboard.press("Tab");
    // The overview panel holds only text, so it takes focus itself.
    expect(await focusedId(page)).toBe("panel-overview");
    await page.locator("#tab-activity").click();
    await expect(page.locator("#panel-activity")).toBeVisible();
    await page.locator("#tab-activity").focus();
    await page.keyboard.press("Tab");
    // The activity panel holds a button, which takes focus instead.
    expect(await focusedId(page)).toBe("activity-refresh");
    await expect(page.locator("#panel-activity")).not.toHaveAttribute("tabindex");
  });

  test("shows only the selected panel", async ({ page }) => {
    await openNavigation(page);
    await expect(page.locator("#panel-overview")).toBeVisible();
    await expect(page.locator("#panel-activity")).toBeHidden();
    await page.locator("#tab-billing").click();
    await expect(page.locator("#panel-billing")).toBeVisible();
    await expect(page.locator("#panel-overview")).toBeHidden();
  });
});

test.describe("idg-tabs keyboard", () => {
  test("automatic activation: the arrows select as they move, skip the disabled tab, wrap, and Home and End go to the ends", async ({
    page,
  }) => {
    await openNavigation(page);
    await recordEvents(page, "tabs", ["idgChange"]);
    await page.locator("#tab-overview").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focusedId(page)).toBe("tab-activity");
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["activity"]);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focusedId(page)).toBe("tab-billing");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focusedId(page)).toBe("tab-overview");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => focusedId(page)).toBe("tab-billing");
    await page.keyboard.press("Home");
    await expect.poll(() => focusedId(page)).toBe("tab-overview");
    await page.keyboard.press("End");
    await expect.poll(() => focusedId(page)).toBe("tab-billing");
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["billing"]);
    expect((await events(page, "tabs"))[0]).toEqual({
      type: "idgChange",
      detail: { value: "activity" },
    });
  });

  test("a horizontal list leaves the vertical arrows to the page", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#tab-overview").focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedId(page)).toBe("tab-overview");
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["overview"]);
  });

  test("manual activation: the arrows only move focus, and Enter or Space selects", async ({
    page,
  }) => {
    await openNavigation(page);
    await page.locator("#manual-summary").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focusedId(page)).toBe("manual-details");
    await expect.poll(() => selectedTabs(page, "tabs-manual")).toEqual(["summary"]);
    await page.keyboard.press("Enter");
    await expect.poll(() => selectedTabs(page, "tabs-manual")).toEqual(["details"]);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press(" ");
    await expect.poll(() => selectedTabs(page, "tabs-manual")).toEqual(["notes"]);
  });

  test("a vertical list uses the vertical arrows", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#vertical-profile").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focusedId(page)).toBe("vertical-profile");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedId(page)).toBe("vertical-security");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focusedId(page)).toBe("vertical-profile");
  });

  test("a tab can be chosen with the mouse, and a disabled one cannot", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#tab-settings").click({ force: true });
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["overview"]);
    await page.locator("#tab-activity").click();
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["activity"]);
  });
});

test.describe("idg-tabs when the tabs change", () => {
  test("selecting the next tab when the selected one is removed", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#tab-activity").click();
    await page.evaluate(() => {
      document.getElementById("tab-activity")?.remove();
      document.getElementById("panel-activity")?.remove();
    });
    // Settings is disabled, so Billing takes the place.
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["billing"]);
    await expect(page.locator("#panel-billing")).toBeVisible();
    await expect(page.locator("#tab-billing")).toHaveAttribute("tabindex", "0");
  });

  test("picking up a tab added later, and one disabled later", async ({ page }) => {
    await openNavigation(page);
    await page.evaluate(() => {
      const tab = document.createElement("idg-tab");
      tab.id = "tab-audit";
      tab.setAttribute("value", "audit");
      tab.textContent = "Audit";
      const panel = document.createElement("idg-tab-panel");
      panel.id = "panel-audit";
      panel.setAttribute("value", "audit");
      panel.textContent = "Audit log";
      document.getElementById("tabs")?.append(tab, panel);
    });
    await page.locator("#tab-billing").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focusedId(page)).toBe("tab-audit");
    await expect(page.locator("#panel-audit")).toBeVisible();
    await page.evaluate(() => {
      document.getElementById("tab-audit")?.setAttribute("disabled", "");
    });
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["billing"]);
  });

  test("following tabs that are reordered", async ({ page }) => {
    await openNavigation(page);
    await page.evaluate(() => {
      const tabs = document.getElementById("tabs");
      const billing = document.getElementById("tab-billing");
      if (tabs && billing) tabs.insertBefore(billing, tabs.firstElementChild);
    });
    await page.locator("#tab-billing").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => focusedId(page)).toBe("tab-overview");
  });

  test("a tab list moved while one tab is selected keeps working", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#tab-activity").click();
    await page.evaluate(() => {
      const tabs = document.getElementById("tabs");
      if (tabs) document.querySelector("main")?.append(tabs);
    });
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["activity"]);
    await page.locator("#tab-activity").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedTabs(page, "tabs")).toEqual(["billing"]);
    await expect(page.locator("#panel-billing")).toBeVisible();
    await page.evaluate(() => {
      const tab = document.createElement("idg-tab");
      tab.id = "tab-late";
      tab.setAttribute("value", "late");
      tab.textContent = "Late";
      document.getElementById("tabs")?.append(tab);
    });
    await expect(page.locator("#tab-late")).toHaveAttribute("slot", "tab");
  });
});

test.describe("idg-accordion", () => {
  test("each item is a button in a heading, expanded or not, controlling a named region", async ({
    page,
  }) => {
    await openNavigation(page);
    await expect
      .poll(() => tree(page, "accordion", ["heading", "button"]))
      .toEqual([
        { role: "heading", name: "Shipping" },
        { role: "button", name: "Shipping" },
        { role: "heading", name: "Returns" },
        { role: "button", name: "Returns" },
        { role: "heading", name: "Warranty" },
        { role: "button", name: "Warranty" },
        { role: "heading", name: "Contact New" },
        { role: "button", name: "Contact New" },
      ]);
    await expect
      .poll(async () => (await tree(page, "item-shipping", ["region"]))[0])
      .toEqual({ role: "region", name: "Shipping" });
    await expect
      .poll(() => accessibleNode(page, "item-shipping", "button"))
      .toMatchObject({ properties: { expanded: true }, relations: { controls: 1 } });
    await expect
      .poll(async () => (await accessibleNode(page, "item-returns", "button")).properties)
      .toMatchObject({ expanded: false });
    await expect
      .poll(async () => (await accessibleNode(page, "item-warranty", "button")).properties)
      .toMatchObject({ disabled: true });
  });

  test("the heading level is configurable", async ({ page }) => {
    await openNavigation(page);
    const levels = await page.evaluate(() => [
      document.getElementById("item-shipping")?.shadowRoot?.querySelector("h3") !== null,
      document.getElementById("multi-a")?.shadowRoot?.querySelector("h4") !== null,
    ]);
    expect(levels).toEqual([true, true]);
  });

  test("opening an item closes the open one, and a click on an open item closes it", async ({
    page,
  }) => {
    await openNavigation(page);
    await recordEvents(page, "accordion", ["idgToggle"]);
    await page.locator("#item-returns").locator("button").click();
    await expect(page.locator("#item-returns")).toHaveAttribute("open", "");
    await expect(page.locator("#item-shipping")).not.toHaveAttribute("open");
    await expect(page.locator("#returns-link")).toBeVisible();
    await expect(page.locator("#item-shipping p")).toBeHidden();
    await page.locator("#item-returns").locator("button").click();
    await expect(page.locator("#item-returns")).not.toHaveAttribute("open");
    const log = await events(page, "accordion");
    expect(log.map((entry) => entry.detail)).toEqual([
      { value: "shipping", open: false },
      { value: "returns", open: true },
      { value: "returns", open: false },
    ]);
  });

  test("with multiple, several items stay open", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#multi-c").locator("button").click();
    await expect(page.locator("#multi-a")).toHaveAttribute("open", "");
    await expect(page.locator("#multi-b")).toHaveAttribute("open", "");
    await expect(page.locator("#multi-c")).toHaveAttribute("open", "");
  });

  test("Enter and Space work on the button, and the arrows, Home and End move between enabled headers", async ({
    page,
  }) => {
    await openNavigation(page);
    await page.locator("#item-shipping").locator("button").focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => activeHostId(page)).toBe("item-returns");
    await page.keyboard.press("Enter");
    await expect(page.locator("#item-returns")).toHaveAttribute("open", "");
    // Warranty is disabled, so Contact is next.
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => activeHostId(page)).toBe("item-contact");
    await page.keyboard.press(" ");
    await expect(page.locator("#item-contact")).toHaveAttribute("open", "");
    await page.keyboard.press("Home");
    await expect.poll(() => activeHostId(page)).toBe("item-shipping");
    await page.keyboard.press("End");
    await expect.poll(() => activeHostId(page)).toBe("item-contact");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => activeHostId(page)).toBe("item-shipping");
  });

  test("closed panels are hidden until found, a disabled item's plainly hidden", async ({
    page,
  }) => {
    await openNavigation(page);
    const hidden = (id: string) =>
      page
        .locator(`#${id}`)
        .evaluate((item) =>
          item.shadowRoot?.querySelector('[part="panel"]')?.getAttribute("hidden"),
        );
    expect(await hidden("item-returns")).toBe("until-found");
    expect(await hidden("item-warranty")).toBe("");
    expect(await hidden("item-shipping")).toBeNull();
  });

  test("opens an item when the browser reveals text found in its closed panel", async ({
    page,
  }) => {
    await openNavigation(page);
    // Navigating to a fragment inside a hidden=until-found panel reveals it as find in page does,
    // and fires the same beforematch event.
    await page.evaluate(() => {
      const target = document.getElementById("returns-link");
      if (target) target.id = "returns-target";
      location.hash = "returns-target";
    });
    await expect(page.locator("#item-returns")).toHaveAttribute("open", "");
    await expect(page.locator("#item-shipping")).not.toHaveAttribute("open");
  });
});

test.describe("idg-table", () => {
  test("keeps its native table semantics, with sortable headers as buttons", async ({ page }) => {
    await openNavigation(page);
    await expect
      .poll(() => tree(page, "table", ["table", "columnheader", "rowheader", "button", "caption"]))
      .toEqual([
        { role: "table", name: "Projects" },
        { role: "caption", name: "" },
        { role: "columnheader", name: "Name" },
        { role: "button", name: "Name" },
        { role: "columnheader", name: "Files" },
        { role: "button", name: "Files" },
        { role: "columnheader", name: "Owner" },
        { role: "columnheader", name: "Updated" },
        { role: "button", name: "Updated" },
        ...["Atlas", "Borealis", "Cinder", "Delta", "Ember", "Fjord"].map((name) => ({
          role: "rowheader",
          name,
        })),
      ]);
  });

  const order = (page: Page) =>
    page
      .locator("#table tbody th")
      .evaluateAll((cells) => cells.map((cell) => cell.textContent.trim()));

  test("a click sorts ascending, then descending, and marks only the sorted header", async ({
    page,
  }) => {
    await openNavigation(page);
    await recordEvents(page, "table", ["idgSort"]);
    await page.locator("#table th").nth(1).locator("button").click();
    await expect
      .poll(() => order(page))
      .toEqual(["Delta", "Fjord", "Borealis", "Atlas", "Ember", "Cinder"]);
    await expect(page.locator("#table th").nth(1)).toHaveAttribute("aria-sort", "ascending");
    await page.locator("#table th").nth(1).locator("button").click();
    await expect
      .poll(() => order(page))
      .toEqual(["Cinder", "Ember", "Atlas", "Borealis", "Fjord", "Delta"]);
    await expect(page.locator("#table th").nth(1)).toHaveAttribute("aria-sort", "descending");
    await page.locator("#table th").nth(3).locator("button").click();
    await expect(page.locator("#table th").nth(1)).not.toHaveAttribute("aria-sort");
    // The date column sorts by data-sort-value, not by its text.
    await expect
      .poll(() => order(page))
      .toEqual(["Delta", "Borealis", "Fjord", "Atlas", "Cinder", "Ember"]);
    expect((await events(page, "table")).map((entry) => entry.detail)).toEqual([
      { key: "files", direction: "ascending" },
      { key: "files", direction: "descending" },
      { key: "updated", direction: "ascending" },
    ]);
  });

  test("sorts from the keyboard and keeps focus on the button", async ({ page }) => {
    await openNavigation(page);
    const button = page.locator("#table th").first().locator("button");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#table th").first()).toHaveAttribute("aria-sort", "ascending");
    await page.keyboard.press(" ");
    await expect(page.locator("#table th").first()).toHaveAttribute("aria-sort", "descending");
    await expect(button).toBeFocused();
    await expect(page.locator("#table").locator('[role="status"]')).toHaveText(
      "Sorted by Name, descending",
    );
  });

  test("a wide table scrolls inside its own focusable, named region and never widens the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openNavigation(page);
    const scroller = page.locator("#table-wide").locator('[part="scroller"]');
    await expect(scroller).toHaveAttribute("role", "region");
    await expect(scroller).toHaveAttribute("tabindex", "0");
    await expect
      .poll(async () => (await accessibleNode(page, "table-wide", '[part="scroller"]')).name)
      .toBe("Quarterly figures, in thousands");
    const metrics = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(metrics[0]).toBeLessThanOrEqual(metrics[1] ?? 0);
    await scroller.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expectNoAxeViolations(page);
  });

  test("the label names the scrolling region in place of the caption", async ({ page }) => {
    await openNavigation(page);
    await expect(page.locator("#table").locator('[part="scroller"]')).toHaveAttribute(
      "role",
      "region",
    );
    await expect
      .poll(async () => (await accessibleNode(page, "table", '[part="scroller"]')).name)
      .toBe("Projects, scrollable");
  });

  test("the header stays in view while the rows scroll", async ({ page }) => {
    await openNavigation(page);
    const scroller = page.locator("#table").locator('[part="scroller"]');
    await scroller.evaluate((element) => {
      element.scrollTop = 80;
    });
    const header = await page.locator("#table th").first().boundingBox();
    const frame = await scroller.boundingBox();
    expect(Math.abs((header?.y ?? 0) - ((frame?.y ?? 0) + 1))).toBeLessThan(4);
  });

  test("rows are taller in the spacious UX mode than in the compact one", async ({ page }) => {
    await openNavigation(page);
    const height = async (ux: string) => {
      await applyAxes(page, { ux });
      return (await page.locator("#table tbody tr").first().boundingBox())?.height ?? 0;
    };
    const compact = await height("compact");
    const spacious = await height("spacious");
    expect(spacious).toBeGreaterThan(compact + 8);
  });

  test("keeps rows and borders in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openNavigation(page);
    const border = await page
      .locator("#table tbody td")
      .first()
      .evaluate((cell) => getComputedStyle(cell).borderBlockEndStyle);
    expect(border).toBe("solid");
  });

  test("hands the rows to the page with manual sort when the table is moved", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#table th").first().locator("button").click();
    await page.evaluate(() => {
      const table = document.getElementById("table");
      if (table) document.querySelector("main")?.append(table);
    });
    await page.locator("#table th").first().locator("button").click();
    await expect(page.locator("#table th").first()).toHaveAttribute("aria-sort", "descending");
    await expect.poll(() => page.locator("#table tbody th").first().textContent()).toBe("Fjord");
    // The stylesheet follows the table to wherever it was moved.
    await expect
      .poll(() =>
        page.locator("#table table").evaluate((table) => getComputedStyle(table).borderCollapse),
      )
      .toBe("separate");
  });
});

test.describe("idg-pagination", () => {
  test("is a named navigation with the current page marked and the middle pages left out", async ({
    page,
  }) => {
    await openNavigation(page);
    const pager = page.locator("#pagination-buttons");
    await expect(pager.getByRole("navigation", { name: "Projects pages" })).toHaveCount(1);
    await expect(pager.getByRole("button")).toHaveCount(7);
    await expect(pager.getByRole("button", { name: "Page 12" })).toHaveCount(1);
    expect(await paginationControls(page, "pagination-buttons")).toEqual([
      "<",
      "1",
      "5",
      "6",
      "7",
      "12",
      ">",
    ]);
    await expect(pager.locator('[aria-current="page"]')).toHaveText("6");
  });

  test("buttons report the page, previous and next step, and the ends disable them", async ({
    page,
  }) => {
    await openNavigation(page);
    await recordEvents(page, "pagination-buttons", ["idgPageChange"]);
    await page.locator("#pagination-buttons").locator('[part="next"]').click();
    await expect
      .poll(() => paginationControls(page, "pagination-buttons"))
      .toEqual(["<", "1", "6", "7", "8", "12", ">"]);
    await page
      .locator("#pagination-buttons")
      .locator('[part="page"]')
      .filter({ hasText: /^12$/ })
      .click();
    await expect(page.locator("#pagination-buttons")).toHaveAttribute("page", "12");
    await expect(page.locator("#pagination-buttons").locator('[part="next"]')).toBeDisabled();
    expect((await events(page, "pagination-buttons")).map((entry) => entry.detail)).toEqual([
      { page: 7 },
      { page: 12 },
    ]);
  });

  test("keeps focus in the control when the one pressed becomes unavailable", async ({ page }) => {
    await openNavigation(page);
    await page.evaluate(() => {
      document.getElementById("pagination-buttons")?.setAttribute("page", "11");
    });
    const next = page.locator("#pagination-buttons").locator('[part="next"]');
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(next).toBeDisabled();
    await expect
      .poll(() =>
        page
          .locator("#pagination-buttons")
          .evaluate((host) => host.shadowRoot?.activeElement?.getAttribute("aria-current") ?? ""),
      )
      .toBe("page");
  });

  test("links come from a template, and the unavailable ones are not links", async ({ page }) => {
    await openNavigation(page);
    const hrefs = await page
      .locator("#pagination-links")
      .evaluate((host) =>
        Array.from(host.shadowRoot?.querySelectorAll(".control") ?? []).map((control) =>
          control.getAttribute("href"),
        ),
      );
    expect(hrefs.slice(0, 3)).toEqual([null, "#page-1", "#page-2"]);
    await expect
      .poll(
        async () =>
          (await accessibleNode(page, "pagination-links", '[part="previous"]')).properties,
      )
      .toMatchObject({ disabled: true });
    await page
      .locator("#pagination-links")
      .locator('[part="page"]')
      .filter({ hasText: /^2$/ })
      .click();
    await expect(page).toHaveURL(/#page-2$/);
  });

  test("a template that would make a script url gives buttons", async ({ page }) => {
    await openNavigation(page);
    const kinds = await page
      .locator("#pagination-unsafe")
      .evaluate((host) =>
        Array.from(host.shadowRoot?.querySelectorAll(".control") ?? []).map(
          (control) => control.localName,
        ),
      );
    expect(new Set(kinds)).toEqual(new Set(["button"]));
  });

  test("controls are at least 24px", async ({ page }) => {
    await openNavigation(page);
    for (const control of await page.locator("#pagination-buttons").locator(".control").all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(24);
      expect(box?.height).toBeGreaterThanOrEqual(24);
    }
  });
});

test.describe("navigation components at small sizes and in special modes", () => {
  test("never scroll the page sideways at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openNavigation(page);
    const metrics = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(metrics[0]).toBeLessThanOrEqual(metrics[1] ?? 0);
  });

  test("show a visible current tab, accordion edge and page in forced colours", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openNavigation(page);
    const edge = await page
      .locator("#item-shipping")
      .evaluate(
        (item) => getComputedStyle(item.shadowRoot?.querySelector(".item") ?? item).borderTopStyle,
      );
    expect(edge).toBe("solid");
    const tab = await page
      .locator("#tab-overview")
      .evaluate(
        (item) => getComputedStyle(item.shadowRoot?.querySelector(".tab") ?? item).backgroundColor,
      );
    const other = await page
      .locator("#tab-activity")
      .evaluate(
        (item) => getComputedStyle(item.shadowRoot?.querySelector(".tab") ?? item).backgroundColor,
      );
    expect(tab).not.toBe(other);
  });

  test("stop the chevron and the tab bar moving when reduced motion is asked for", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openNavigation(page);
    const transform = await page
      .locator("#item-shipping")
      .evaluate(
        (item) => getComputedStyle(item.shadowRoot?.querySelector(".chevron") ?? item).transform,
      );
    expect(transform).toMatch(/^none$|matrix\(1, 0, 0, 1, 0, 0\)/);
  });

  test("have a visible focus ring on a tab and a trigger", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#tab-overview").focus();
    await page.keyboard.press("ArrowRight");
    const outline = await page
      .locator("#tab-activity")
      .evaluate((tab) => getComputedStyle(tab).outlineStyle);
    expect(outline).not.toBe("none");
    await page.locator("#item-returns").locator("button").focus();
    await page.keyboard.press("ArrowUp");
    const trigger = await page
      .locator("#item-shipping")
      .locator("button")
      .evaluate((button) => getComputedStyle(button).outlineStyle);
    expect(trigger).not.toBe("none");
  });
});

test.describe("navigation components accessibility", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`have no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openNavigation(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`have no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await openNavigation(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }

  test("have no axe violations with an accordion item and a tab panel open", async ({ page }) => {
    await openNavigation(page);
    await page.locator("#item-contact").locator("button").click();
    await page.locator("#tab-activity").click();
    await expect(page.locator("#panel-activity")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("have no console errors or policy violations on load", async ({ page }) => {
    await page.goto(NAVIGATION_PAGE);
    await expect(page.locator("idg-tabs.hydrated")).toHaveCount(3);
  });
});
