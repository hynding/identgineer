import { expect, test } from "./fixtures";
import {
  calls,
  eventNames,
  heard,
  openDashboard,
  pagination,
  picker,
  pickerSelect,
  rows,
  status,
  table,
} from "./dashboard-page";

test.describe("the property picker", () => {
  test("lists the user's properties, with the first chosen, and nothing of anyone else's", async ({
    page,
  }) => {
    await openDashboard(page);
    await expect(pickerSelect(page).locator("option")).toHaveText([
      "Choose a property",
      "Docs · docs.example.com",
      "Shop · shop.example.com",
      "Blog",
    ]);
    await expect(pickerSelect(page)).toHaveValue("p-docs");
    await expect(page.getByLabel("Site")).toBeVisible();
    expect(JSON.stringify(await calls(page))).not.toContain("p-stranger");
  });

  test("choosing a property loads its figures and events, once, and reports the id", async ({
    page,
  }) => {
    await openDashboard(page);
    await pickerSelect(page).selectOption("p-shop");
    await expect(rows(page)).toHaveCount(4);
    await expect(page.locator("#stat-visitors")).toBeVisible();
    expect((await heard(page)).filter((item) => item.type === "idgChange")).toEqual([
      { type: "idgChange", detail: { value: "p-shop" }, target: "idg-property-picker" },
    ]);
    const asked = await calls(page);
    expect(asked.filter((call) => call.method === "listEvents").at(-1)?.args[0]).toBe("p-shop");
  });

  test("can be reached and changed from the keyboard", async ({ page }) => {
    await openDashboard(page);
    await pickerSelect(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(pickerSelect(page)).toHaveValue("p-shop");
    await expect(rows(page)).toHaveCount(4);
  });

  test("an unknown value selects no property, and not the first", async ({ page }) => {
    await openDashboard(page, { query: "?property=nobody" });
    // The fixture falls back to the first property itself; here the picker is handed a value it
    // does not know.
    await picker(page).evaluate((element) => {
      (element as HTMLElement & { value: string }).value = "nobody";
    });
    await expect(pickerSelect(page)).toHaveValue("");
    await expect(pickerSelect(page).locator("option").first()).toHaveText("Choose a property");
    expect(
      await picker(page).evaluate((element) => (element as HTMLElement & { value: string }).value),
    ).toBe("nobody");
  });

  test("says it is loading, and is busy and disabled, until the properties arrive", async ({
    page,
  }) => {
    await openDashboard(page, { query: "?hold", wait: "booted" });
    await expect(pickerSelect(page)).toBeDisabled();
    await expect(picker(page).locator('[role="status"]')).toHaveText("Loading properties");
    await expect(picker(page).locator("[aria-busy='true']")).toHaveCount(1);
    await page.evaluate(`window.dashboardFixture.release()`);
    await expect(pickerSelect(page)).toBeEnabled();
    await expect(picker(page).locator("[aria-busy]")).toHaveCount(0);
  });

  test("is disabled, with a word for it, when there are no properties", async ({ page }) => {
    await openDashboard(page, { query: "?none" });
    await expect(pickerSelect(page)).toBeDisabled();
    await expect(pickerSelect(page).locator("option")).toHaveText(["No properties"]);
    await expect(status(page)).toHaveText("No events yet.");
  });

  test("shows a name as text, cut and neutralised, and an id never as markup", async ({ page }) => {
    await openDashboard(page, { query: "?hostile" });
    const option = pickerSelect(page).locator("option[value='p-evil']");
    const text = (await option.textContent()) ?? "";
    expect(text).toContain("<img src=x onerror=alert(1)>");
    expect(text).not.toMatch(/‮/);
    expect(text.length).toBeLessThanOrEqual(80 + " · evil.example.com".length + 1);
    await expect(page.locator("#picker img")).toHaveCount(0);
  });

  test("takes part in a form: the chosen id is submitted under its name", async ({ page }) => {
    await openDashboard(page);
    const submitted = await page.evaluate(() => {
      const form = document.createElement("form");
      const control = document.getElementById("picker") as HTMLElement & { name: string };
      control.name = "property";
      document.body.append(form);
      form.append(control);
      return new Promise<string>((resolve) => {
        requestAnimationFrame(() => {
          resolve((new FormData(form).get("property") as string | null) ?? "");
        });
      });
    });
    expect(submitted).toBe("p-docs");
  });
});

test.describe("the event table", () => {
  test("is a named table with the events of the first page, newest first, and says which", async ({
    page,
  }) => {
    await openDashboard(page);
    await expect(page.getByRole("table", { name: "Tracked events" })).toBeVisible();
    await expect(rows(page)).toHaveCount(10);
    await expect(status(page)).toHaveText("Showing 1–10 of 95 events");
    await expect(table(page).locator("time").first()).toHaveAttribute(
      "datetime",
      "2026-03-01T12:00:00.000Z",
    );
  });

  test("pages with the pagination: the page is fetched, then drawn, and idgPageChange is said once", async ({
    page,
  }) => {
    await openDashboard(page);
    await pagination(page).getByRole("button", { name: "Page 3" }).click();
    await expect(status(page)).toHaveText("Showing 21–30 of 95 events");
    await expect(pagination(page).locator("[aria-current='page']")).toHaveText("3");
    expect((await heard(page)).filter((item) => item.type === "idgPageChange")).toEqual([
      { type: "idgPageChange", detail: { page: 3 }, target: "idg-event-table" },
    ]);
    const listing = (await calls(page)).filter((call) => call.method === "listEvents");
    expect(listing.at(-1)?.args[1]).toMatchObject({ page: 3, pageSize: 10 });
  });

  test("moves between pages by keyboard and keeps focus in the pagination", async ({ page }) => {
    await openDashboard(page);
    await pagination(page).getByRole("button", { name: "Next page" }).focus();
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText("Showing 11–20 of 95 events");
    await expect(pagination(page).locator("button:focus")).toHaveCount(1);
  });

  test("sorts by a header: aria-sort, a request in that order, and idgSort once", async ({
    page,
  }) => {
    await openDashboard(page);
    await table(page).getByRole("button", { name: "Event" }).click();
    await expect(table(page).locator("th[aria-sort]")).toHaveAttribute("aria-sort", "ascending");
    await expect(table(page).locator("th[aria-sort]")).toHaveCount(1);
    await expect.poll(async () => (await eventNames(page))[0]).toBe("button_clicked");
    await table(page).getByRole("button", { name: "Event" }).click();
    await expect(table(page).locator("th[aria-sort]")).toHaveAttribute("aria-sort", "descending");
    await expect.poll(async () => (await eventNames(page))[0]).toBe("signup_completed");
    const sorts = (await heard(page)).filter((item) => item.type === "idgSort");
    expect(sorts.map((item) => item.detail)).toEqual([
      { key: "name", direction: "ascending" },
      { key: "name", direction: "descending" },
    ]);
    await table(page).getByRole("button", { name: "Time" }).click();
    await expect(table(page).locator("th[aria-sort]")).toHaveText(/Time/);
  });

  test("shows a skeleton and says it is loading, politely, while a page is on its way", async ({
    page,
  }) => {
    await openDashboard(page, { query: "?hold", wait: "booted" });
    await expect(table(page).locator("idg-skeleton")).toBeVisible();
    await expect(table(page).locator("[aria-busy='true']")).toHaveCount(1);
    await expect(table(page).locator("table")).toHaveCount(0);
    await expect(status(page)).toHaveText("Loading events");
    await page.evaluate(`window.dashboardFixture.release()`);
    await expect(rows(page)).toHaveCount(10);
    await expect(table(page).locator("[aria-busy]")).toHaveCount(0);
  });

  test("says an error in an alert inside the polite region, and recovers on the next choice", async ({
    page,
  }) => {
    await openDashboard(page, { query: "?fail-events" });
    const region = status(page);
    await expect(region.locator("idg-alert")).toContainText("Events could not be loaded");
    await expect(table(page).locator("table")).toHaveCount(0);
    await expect(table(page).locator("[role='alert']")).toHaveCount(0);
    await pickerSelect(page).selectOption("p-shop");
    await expect(rows(page)).toHaveCount(4);
    await expect(region.locator("idg-alert")).toHaveCount(0);
  });

  test("says there are no events, and still names the table", async ({ page }) => {
    await openDashboard(page);
    await pickerSelect(page).selectOption("p-blog");
    await expect(status(page)).toHaveText("No events yet.");
    await expect(table(page).locator("[part='caption']")).toHaveText("Tracked events");
    await expect(pagination(page)).toHaveCount(0);
  });

  test("a slow answer for the property left behind never replaces the one chosen last", async ({
    page,
  }) => {
    await openDashboard(page);
    await pickerSelect(page).selectOption("p-shop");
    await pickerSelect(page).selectOption("p-blog");
    await expect(status(page)).toHaveText("No events yet.");
    await page.waitForTimeout(200);
    await expect(status(page)).toHaveText("No events yet.");
  });
});

test.describe("untrusted text", () => {
  test("is drawn as text: nothing runs, nothing is linked, no handler or style is made", async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await openDashboard(page, { query: "?hostile&property=p-evil" });
    await pickerSelect(page).selectOption("p-evil");
    await expect(rows(page)).toHaveCount(4);
    const found = await table(page).evaluate((element) => {
      const root = element.shadowRoot;
      const inside = root?.querySelector("table");
      const nodes = Array.from(inside?.querySelectorAll("*") ?? []);
      return {
        elements: inside?.querySelectorAll("img, script, b, a, [href], [src]").length,
        handlers: nodes.flatMap((node) =>
          node.getAttributeNames().filter((name) => name.startsWith("on") || name === "style"),
        ),
        text: inside?.textContent ?? "",
      };
    });
    expect(found.elements).toBe(0);
    expect(found.handlers).toEqual([]);
    expect(found.text).toContain('<img src=x onerror="alert(1)">');
    expect(found.text).toContain("javascript:alert(document.cookie)");
    expect(found.text).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(found.text).toContain("pay�fdp.exe");
    expect(dialogs).toEqual([]);
  });

  test("a long value wraps or is cut, and never widens the page or its row", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await openDashboard(page, { query: "?hostile&property=p-evil" });
    await pickerSelect(page).selectOption("p-evil");
    await expect(rows(page)).toHaveCount(4);
    const overflowed = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowed).toBeLessThanOrEqual(0);
    const cut = await table(page).locator("tbody th").nth(1).innerText();
    expect(cut.length).toBeLessThanOrEqual(121);
    expect(cut.endsWith("…")).toBe(true);
  });

  test("shows ten properties of an event and counts the rest", async ({ page }) => {
    await openDashboard(page, { query: "?hostile&property=p-evil" });
    await pickerSelect(page).selectOption("p-evil");
    const cell = rows(page).nth(2).locator("td.properties");
    await expect(cell.locator("li:not(.more)")).toHaveCount(10);
    await expect(cell.locator("li.more")).toHaveText("+20 more");
  });
});

test.describe("the figures", () => {
  test("each stat has its change, with a direction in words and an icon, and a sparkline named by it", async ({
    page,
  }) => {
    await openDashboard(page);
    const stat = page.locator("#stat-visitors");
    await expect(stat.locator('[part="delta"] .visually-hidden')).toContainText("Increased by");
    await expect(stat.locator('[part="delta"] idg-icon')).toHaveAttribute("name", "arrow-up");
    await expect(stat.locator('[part="period"]')).toHaveText("vs the 7 days before");
    const spark = page.locator("#spark-visitors svg");
    await expect(spark).toHaveAttribute("role", "img");
    await expect(spark).toHaveAttribute("aria-label", /^Visitors per day: From \d+/);
  });

  test("a sparkline draws its end mark, and nothing in it animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDashboard(page);
    const spark = page.locator("#spark-visitors");
    await expect(spark.locator('[part="end"]')).toBeVisible();
    const animations = await spark.evaluate((element) => {
      const root = element.shadowRoot;
      return (root?.getAnimations() ?? []).length;
    });
    expect(animations).toBe(0);
  });

  test("the figures follow the property that was chosen", async ({ page }) => {
    await openDashboard(page);
    const value = page.locator('#stat-visitors [part="value"]');
    const before = await value.innerText();
    await pickerSelect(page).selectOption("p-shop");
    await expect(value).not.toHaveText(before);
  });
});

test.describe("language", () => {
  test("times and numbers follow the page's language", async ({ page }) => {
    await openDashboard(page, { query: "?lang=de" });
    await expect(table(page).locator("time").first()).toContainText("01.03.2026");
    await expect(status(page)).toHaveText("Showing 1–10 of 95 events");
    await expect(page.locator('#stat-pageviews [part="value"]')).toHaveText(/\d\.\d{3}/);
  });
});
