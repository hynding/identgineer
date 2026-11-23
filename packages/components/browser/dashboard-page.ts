import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export const DASHBOARD_PAGE = "/fixtures/dashboard.html";
const TAGS = [
  "idg-property-picker",
  "idg-event-table",
  "idg-sparkline",
  "idg-stat",
  "idg-card",
  "idg-variation-switcher",
];

export interface OpenOptions {
  /**
   * Query string for the fixture: `?hostile`, `?none`, `?hold`, `?fail-events`, `?fail-properties`,
   * `?lang=de`, `?dir=rtl`, `?events=N`, `?page-size=N`, `?property=ID`.
   */
  readonly query?: string;
  /** `booted` leaves the first answers unread (for `?hold`); `ready` waits for them. */
  readonly wait?: "booted" | "ready";
}

/**
 * Opens the dashboard fixture, whose source is the fake that stands in for the authenticated API,
 * and waits until it has drawn what the first answers call for, and every control it draws (the
 * select, the field, the table, the pagination, the alert, the skeleton) has hydrated, so a press
 * or a Tab never reaches an element that is not yet a control.
 */
export async function openDashboard(page: Page, options: OpenOptions = {}): Promise<void> {
  await page.goto(`${DASHBOARD_PAGE}${options.query ?? ""}`);
  await expect(page.locator("html[data-dashboard-booted]")).toHaveCount(1);
  if (options.wait !== "booted")
    await expect(page.locator("html[data-dashboard-ready]")).toHaveCount(1);
  await settled(page, options.wait === "booted");
}

/** Waits until every dashboard element, and what it draws, has hydrated, and a frame has passed. */
export async function settled(page: Page, loading = false): Promise<void> {
  await expect(
    page.locator(
      [
        ...TAGS,
        "idg-field",
        "idg-select",
        "idg-table",
        "idg-pagination",
        "idg-alert",
        "idg-skeleton",
        "idg-icon",
      ]
        .map((tag) => `${tag}:not(.hydrated)`)
        .join(", "),
    ),
  ).toHaveCount(0);
  if (!loading) await expect(page.locator("#events")).not.toHaveAttribute("loading", "");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

export const picker = (page: Page) => page.locator("#picker");
export const pickerSelect = (page: Page) => page.locator("#picker select");
export const table = (page: Page) => page.locator("#events");
export const rows = (page: Page) => table(page).locator("tbody tr");
export const status = (page: Page) => table(page).locator('[part="status"]');
export const pagination = (page: Page) => table(page).locator("idg-pagination");

/** The names in the first column of the table, in order. */
export function eventNames(page: Page): Promise<string[]> {
  return rows(page).locator("th").allInnerTexts();
}

/** What the dashboard fixture recorded: the calls it made to its source and the events it heard. */
export function calls(page: Page): Promise<{ method: string; args: unknown[] }[]> {
  return page.evaluate(`JSON.parse(JSON.stringify(window.dashboardFixture.calls))`);
}

export function heard(page: Page): Promise<{ type: string; detail: unknown; target: string }[]> {
  return page.evaluate(`JSON.parse(JSON.stringify(window.dashboardFixture.log))`);
}

/** The page's own horizontal overflow, which must stay at zero. */
export function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** The accessible name or text of the control that has focus, through every shadow root. */
export function focusedControl(page: Page): Promise<string> {
  return page.evaluate(() => {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    if (!active || active === document.body) return "none";
    return active.getAttribute("aria-label") ?? (active.textContent ?? "").trim();
  });
}

/** Holds every answer of the fixture's source back, and returns what lets them through. */
export async function holdAnswers(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(`window.__release = window.dashboardFixture.fake.hold()`);
  return async () => {
    await page.evaluate(`window.__release()`);
  };
}
