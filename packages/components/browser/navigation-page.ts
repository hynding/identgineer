import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export const NAVIGATION_PAGE = "/fixtures/navigation.html";

const TAGS = [
  "idg-tabs",
  "idg-tab",
  "idg-tab-panel",
  "idg-accordion",
  "idg-accordion-item",
  "idg-table",
  "idg-pagination",
  "idg-breadcrumb",
  "idg-breadcrumb-item",
  "idg-button",
  "idg-badge",
];

/** Opens the navigation fixture and waits until every component on it has hydrated. */
export async function openNavigation(page: Page): Promise<void> {
  await page.goto(NAVIGATION_PAGE);
  await expect(page.locator(TAGS.map((tag) => `${tag}:not(.hydrated)`).join(", "))).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/** The values of the tabs that report themselves selected, in order. */
export function selectedTabs(page: Page, tabsId: string): Promise<string[]> {
  return page.evaluate(
    (id) =>
      Array.from(document.querySelectorAll(`#${id} > idg-tab[selected]`)).map(
        (tab) => tab.getAttribute("value") ?? "",
      ),
    tabsId,
  );
}

/** The text of each control of a pagination, in order: `<` and `>` for previous and next. */
export function paginationControls(page: Page, id: string): Promise<string[]> {
  return page.locator(`#${id}`).evaluate((host) =>
    Array.from(host.shadowRoot?.querySelectorAll(".control") ?? []).map((control) => {
      const part = control.getAttribute("part");
      if (part === "previous") return "<";
      if (part === "next") return ">";
      return control.textContent.trim();
    }),
  );
}
