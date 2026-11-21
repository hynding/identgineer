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
    // Only the open panel is a landmark, so closed ones are not empty regions.
    await expect
      .poll(async () => (await tree(page, "accordion", ["region"])).map((node) => node.name))
      .toEqual(["Shipping"]);
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

  test("keeps focus on the current page when a page number is used, as the list is redrawn", async ({
    page,
  }) => {
    await openNavigation(page);
    await page.evaluate(() => {
      const pager = document.getElementById("pagination-buttons");
      pager?.setAttribute("page-count", "20");
      pager?.setAttribute("page", "1");
    });
    const pager = page.locator("#pagination-buttons");
    const focused = () =>
      pager.evaluate((host) => host.shadowRoot?.activeElement?.textContent.trim() ?? "none");
    const label = (name: RegExp) => pager.locator('[part="page"]').filter({ hasText: name });
    // The list is drawn for the new count and page before it is used.
    await expect(label(/^20$/)).toHaveCount(1);
    await expect(label(/^5$/)).toHaveAttribute("aria-label", "Page 5");
    // Each press moves the window of pages, so the buttons are redrawn around the ellipsis.
    for (const next of ["5", "4", "3"]) {
      await label(new RegExp(`^${next}$`)).focus();
      await page.keyboard.press("Enter");
      await expect(pager).toHaveAttribute("page", next);
      await expect.poll(focused).toBe(next);
    }
    await label(/^20$/).click();
    await expect(pager).toHaveAttribute("page", "20");
    await expect.poll(focused).toBe("20");
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

/** Adds a table built from nodes, not markup, to the page and waits until it has hydrated. */
async function addNestedTables(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const make = (name: string, attributes: Record<string, string> = {}, text = "") => {
      const element = document.createElement(name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      if (text !== "") element.textContent = text;
      return element;
    };
    const table = (id: string, key: string, head: string, rows: Element[]) => {
      const host = make("idg-table", { id });
      const body = make("tbody");
      body.append(...rows);
      const header = make("tr");
      header.append(make("th", { scope: "col", "data-sortable": key }, head));
      const sections = make("thead");
      sections.append(header);
      const native = make("table");
      native.append(sections, body);
      host.append(native);
      return host;
    };
    const row = (...cells: Element[]) => {
      const element = make("tr");
      element.append(...cells);
      return element;
    };
    const cell = (child: Element | string, attributes: Record<string, string> = {}) => {
      const element = make("td", attributes);
      if (typeof child === "string") element.textContent = child;
      else element.append(child);
      return element;
    };
    const inner = table("inner", "inner", "Inner", [row(cell("b")), row(cell("a"))]);
    const plain = make("table", { id: "plain" });
    const plainHead = make("thead");
    const plainRow = make("tr");
    plainRow.append(make("th", { scope: "col", "data-sortable": "plain" }, "Plain"));
    plainHead.append(plainRow);
    plain.append(plainHead);
    const outer = table("outer", "outer", "Outer", [
      row(cell(inner, { id: "span-cell" })),
      row(cell(plain)),
      row(cell("x")),
    ]);
    document.body.append(outer);
    await Promise.all(
      [outer, inner].map((host) =>
        (host as unknown as { componentOnReady: () => Promise<void> }).componentOnReady(),
      ),
    );
  });
}

test.describe("idg-table nested in a cell of another", () => {
  test("stays responsive as the outer body gains and loses a spanning cell, each table keeping its own sorting", async ({
    page,
  }) => {
    await openNavigation(page);
    await addNestedTables(page);
    const buttons = (selector: string) => page.locator(`${selector} button.idg-table-sort`);
    const innerRows = () =>
      page.locator("#inner tbody td").evaluateAll((cells) => cells.map((cell) => cell.textContent));
    await expect(buttons("#outer > table > thead")).toHaveCount(1);
    await expect(buttons("#inner")).toHaveCount(1);
    // A plain table inside a cell is not the component's, and gets nothing from it.
    await expect(page.locator("#plain button")).toHaveCount(0);
    for (let toggle = 0; toggle < 3; toggle += 1) {
      await page.locator("#span-cell").evaluate((cell) => {
        cell.setAttribute("colspan", "2");
      });
      await expect(buttons("#outer > table > thead")).toHaveCount(0);
      // The page answers, so the two tables are not chasing each other.
      expect(await page.evaluate(() => 1 + 1)).toBe(2);
      await expect(buttons("#inner")).toHaveCount(1);
      await page.locator("#span-cell").evaluate((cell) => {
        cell.removeAttribute("colspan");
      });
      await expect(buttons("#outer > table > thead")).toHaveCount(1);
      await expect(buttons("#inner")).toHaveCount(1);
    }
    await buttons("#inner").click();
    await expect.poll(innerRows).toEqual(["a", "b"]);
    await expect(page.locator("#inner th")).toHaveAttribute("aria-sort", "ascending");
    await expect(page.locator("#outer > table > thead th")).not.toHaveAttribute("aria-sort");
    await buttons("#outer > table > thead").click();
    await expect(page.locator("#outer > table > thead th")).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    await expect(page.locator("#inner th")).toHaveAttribute("aria-sort", "ascending");
    await expect(page.locator("#plain th")).not.toHaveAttribute("aria-sort");
    await expect.poll(innerRows).toEqual(["a", "b"]);
  });
});

test.describe("idg-table with manual-sort and a loading row", () => {
  test("keeps its sort button and focus when the page swaps the body for a spanning row", async ({
    page,
  }) => {
    await openNavigation(page);
    await page.evaluate(async () => {
      const host = document.createElement("idg-table");
      host.id = "manual";
      host.setAttribute("manual-sort", "");
      const native = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      const header = document.createElement("th");
      header.setAttribute("scope", "col");
      header.setAttribute("data-sortable", "name");
      header.textContent = "Name";
      headRow.append(header);
      head.append(headRow);
      const body = document.createElement("tbody");
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.textContent = "Ada";
      row.append(cell);
      body.append(row);
      native.append(head, body);
      host.append(native);
      Object.assign(window, { sorts: 0 });
      host.addEventListener("idgSort", () => {
        (window as unknown as { sorts: number }).sorts += 1;
        const loading = document.createElement("tr");
        const wide = document.createElement("td");
        wide.setAttribute("colspan", "2");
        wide.textContent = "Loading";
        loading.append(wide);
        body.replaceChildren(loading);
      });
      document.body.append(host);
      await (host as unknown as { componentOnReady: () => Promise<void> }).componentOnReady();
    });
    const button = page.locator("#manual button.idg-table-sort");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { sorts: number }).sorts))
      .toBe(1);
    await expect(page.locator("#manual tbody td")).toHaveText("Loading");
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { sorts: number }).sorts))
      .toBe(2);
  });

  test("moves focus to the header when spanning cells take the button away", async ({ page }) => {
    await openNavigation(page);
    await page.evaluate(() => {
      const host = document.getElementById("table");
      const body = host?.querySelector("tbody");
      if (!body) throw new Error("no body");
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.id = "late-span";
      cell.setAttribute("colspan", "4");
      row.append(cell);
      Object.assign(window, { lateRow: row });
    });
    await page.locator("#table button.idg-table-sort").first().focus();
    await page.evaluate(() => {
      const row = (window as unknown as { lateRow: Element }).lateRow;
      document.querySelector("#table tbody")?.append(row);
    });
    await expect(page.locator("#table button.idg-table-sort")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.localName ?? ""))
      .not.toBe("body");
    await expect(page.locator("#table thead th").first()).toBeFocused();
  });
});

test.describe("idg-pagination and focus the page moved", () => {
  for (const mode of ["synchronously", "in a microtask", "in a frame"] as const) {
    test(`leaves focus where the page put it ${mode}`, async ({ page }) => {
      await openNavigation(page);
      await page.evaluate((how) => {
        const target = document.createElement("button");
        target.id = "moved-to";
        target.textContent = "Moved here";
        document.body.append(target);
        document.getElementById("pagination-buttons")?.addEventListener("idgPageChange", () => {
          const move = () => {
            target.focus();
          };
          if (how === "synchronously") move();
          else if (how === "in a microtask") queueMicrotask(move);
          else requestAnimationFrame(move);
        });
      }, mode);
      const pager = page.locator("#pagination-buttons");
      await pager.locator('[part="page"]').filter({ hasText: /^7$/ }).focus();
      await page.keyboard.press("Enter");
      await expect(pager).toHaveAttribute("page", "7");
      await expect(page.locator("#moved-to")).toBeFocused();
      // Give any late recovery time to show itself before it is judged.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await expect(page.locator("#moved-to")).toBeFocused();
    });
  }
});

test.describe("idg-table and a page that reacts to focus", () => {
  async function addTable(page: Page, withInput: boolean): Promise<void> {
    await page.evaluate(async (inputInCell) => {
      const host = document.createElement("idg-table");
      host.id = "reacting";
      host.setAttribute("sort-key", "n");
      host.setAttribute("sort-direction", "descending");
      const native = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      const header = document.createElement("th");
      header.setAttribute("scope", "col");
      header.setAttribute("data-sortable", "n");
      header.textContent = "N";
      headRow.append(header);
      head.append(headRow);
      const body = document.createElement("tbody");
      for (const value of ["5", "3", "1"]) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        if (inputInCell && value === "3") {
          const input = document.createElement("idg-input");
          input.setAttribute("label", "Cell input");
          cell.setAttribute("data-sort-value", value);
          cell.append(input);
        } else {
          cell.textContent = value;
          cell.tabIndex = 0;
        }
        row.append(cell);
        body.append(row);
      }
      native.append(head, body);
      host.append(native);
      document.body.append(host);
      await (host as unknown as { componentOnReady: () => Promise<void> }).componentOnReady();
      // A page that adds a row whenever focus arrives, capped so a regression fails and does not hang.
      const counts = { focusin: 0, focusout: 0 };
      Object.assign(window, { counts });
      host.addEventListener("focusin", () => {
        counts.focusin += 1;
        if (counts.focusin > 20) return;
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.textContent = "9";
        row.append(cell);
        body.append(row);
      });
      host.addEventListener("focusout", () => {
        counts.focusout += 1;
      });
    }, withInput);
  }

  const counts = (page: Page) =>
    page.evaluate(
      () => (window as unknown as { counts: { focusin: number; focusout: number } }).counts,
    );
  const column = (page: Page) =>
    page
      .locator("#reacting tbody tr")
      .evaluateAll((rows) =>
        rows.map((row) => row.children[0]?.getAttribute("data-sort-value") ?? row.textContent),
      );

  test("sorting leaves focus where it is and runs no focus handler", async ({ page }) => {
    await openNavigation(page);
    await addTable(page, false);
    await page.locator("#reacting tbody td").nth(2).focus();
    await expect.poll(() => counts(page)).toEqual({ focusin: 1, focusout: 0 });
    // The row with the focus is the last of three and will be the first once sorted up.
    await page.locator("#reacting").evaluate((host) => {
      host.setAttribute("sort-direction", "ascending");
    });
    await expect.poll(() => column(page)).toEqual(["1", "3", "5", "9"]);
    await expect(page.locator("#reacting tbody td").first()).toBeFocused();
    expect(await counts(page)).toEqual({ focusin: 1, focusout: 0 });
  });

  test("keeps focus on a control inside a cell, and inside a shadow root, through a sort", async ({
    page,
  }) => {
    await openNavigation(page);
    await addTable(page, true);
    const input = page.locator("#reacting idg-input input");
    await input.focus();
    await expect.poll(() => counts(page)).toMatchObject({ focusin: 1 });
    await page.locator("#reacting").evaluate((host) => {
      host.setAttribute("sort-direction", "ascending");
    });
    await expect.poll(() => column(page)).toEqual(["1", "3", "5", "9"]);
    await expect(input).toBeFocused();
    expect(await counts(page)).toEqual({ focusin: 1, focusout: 0 });
  });
});

test.describe("idg-pagination redrawn by script with a control focused", () => {
  for (const id of ["pagination-buttons", "pagination-links"]) {
    const mode = id === "pagination-buttons" ? "buttons" : "links";
    const focused = (page: Page) =>
      page
        .locator(`#${id}`)
        .evaluate((host) => host.shadowRoot?.activeElement?.textContent.trim() ?? "none");
    const settled = async (page: Page, expected: string) => {
      await expect.poll(() => focused(page)).toBe(expected);
      // A late loss shows itself a frame or two on.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      expect(await focused(page)).toBe(expected);
    };
    const control = (page: Page, name: string) =>
      page
        .locator(`#${id}`)
        .locator('[part="page"]')
        .filter({ hasText: new RegExp(`^${name}$`) });
    const set = (page: Page, attributes: Record<string, string>) =>
      page.locator(`#${id}`).evaluate((host, values) => {
        for (const [key, value] of Object.entries(values)) host.setAttribute(key, value);
      }, attributes);

    test(`${mode}: the focused page number keeps focus when the count and page are set from script`, async ({
      page,
    }) => {
      await openNavigation(page);
      await set(page, { "page-count": "12", page: "6" });
      await expect(control(page, "5")).toHaveCount(1);
      await control(page, "5").focus();
      await set(page, { "page-count": "20", page: "1" });
      await settled(page, "5");
      await set(page, { page: "10" });
      await expect(control(page, "7")).toHaveCount(0);
      await set(page, { page: "6" });
      await control(page, "7").focus();
      await set(page, { page: "8" });
      await settled(page, "7");
      // A control that is gone hands focus to the current page.
      await set(page, { page: "12" });
      await settled(page, "12");
    });

    test(`${mode}: focus stays on the pressed number when the page cancels the press and sets the page itself`, async ({
      page,
    }) => {
      await openNavigation(page);
      await set(page, { "page-count": "12", page: "6" });
      await page.locator(`#${id}`).evaluate((host) => {
        host.addEventListener("idgPageChange", (event) => {
          event.preventDefault();
        });
      });
      await expect(control(page, "7")).toHaveCount(1);
      await control(page, "7").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(`#${id}`)).toHaveAttribute("page", "6");
      await set(page, { page: "7" });
      await settled(page, "7");
      // And the same through the truncation boundary at the start of a long list.
      await set(page, { "page-count": "20", page: "1" });
      await expect(control(page, "5")).toHaveCount(1);
      await control(page, "5").focus();
      await page.keyboard.press("Enter");
      await set(page, { page: "5" });
      await settled(page, "5");
    });
  }
});
