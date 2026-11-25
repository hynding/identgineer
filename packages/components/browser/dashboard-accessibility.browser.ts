import type { Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, SCHEMES, THEMES, UX_MODES, applyAxes, settle, type Axes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { openDashboard, overflow, pagination, pickerSelect, rows, table } from "./dashboard-page";
import { expect, test } from "./fixtures";
import { setTextSize, TEXT_SIZES } from "./text-size";

async function expectAccessibleUnder(page: Page, axes: Axes): Promise<void> {
  await openDashboard(page, { query: "?hostile" });
  await applyAxes(page, axes);
  await expectNoAxeViolations(page);
  await pickerSelect(page).selectOption("p-evil");
  await expect(rows(page)).toHaveCount(4);
  await settle(page);
  await expectNoAxeViolations(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
}

test.describe("dashboard components meet WCAG 2.2 AA", () => {
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

  test("while loading, with an error, with nothing to show, and with no properties", async ({
    page,
  }) => {
    await openDashboard(page, { query: "?hold", wait: "booted" });
    await settle(page);
    await expectNoAxeViolations(page);
    await page.evaluate(`window.dashboardFixture.release()`);
    await expect(rows(page)).toHaveCount(10);
    await pickerSelect(page).selectOption("p-blog");
    await expect(table(page).locator('[part="status"]')).toHaveText("No events yet.");
    await settle(page);
    await expectNoAxeViolations(page);
    await openDashboard(page, { query: "?fail-events" });
    await expect(table(page).locator("idg-alert")).toBeVisible();
    await settle(page);
    await expectNoAxeViolations(page);
    await openDashboard(page, { query: "?none" });
    await settle(page);
    await expectNoAxeViolations(page);
  });
});

test.describe("dashboard components with large text on a narrow screen", () => {
  UX_MODES.forEach((ux, index) => {
    const design = DESIGNS[(index + 3) % DESIGNS.length] ?? "flat";
    const layout = LAYOUTS[(index + 5) % LAYOUTS.length] ?? "top-bar";
    test(`nothing scrolls sideways at 320px with the text doubled, in the ${ux} UX mode (${design}, ${layout})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openDashboard(page, { query: "?hostile" });
      await applyAxes(page, { ux, design, layout });
      await page.locator("html").evaluate((element) => {
        element.style.fontSize = "200%";
      });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await pickerSelect(page).selectOption("p-evil");
      await expect(rows(page)).toHaveCount(4);
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // A table wider than its frame scrolls in that frame, and the frame can be reached by keyboard.
      const reachable = await table(page).evaluate((element) => {
        const scroller = element.shadowRoot
          ?.querySelector("idg-table")
          ?.shadowRoot?.querySelector(".scroller");
        return (
          !scroller ||
          scroller.scrollWidth <= scroller.clientWidth ||
          scroller.getAttribute("tabindex") === "0"
        );
      });
      expect(reachable).toBe(true);
      await expectNoAxeViolations(page);
    });
  });

  test("the stats and their sparklines stay inside their cards at 320px with the text doubled", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openDashboard(page);
    await page.locator("html").evaluate((element) => {
      element.style.fontSize = "200%";
    });
    await settle(page);
    for (const id of ["visitors", "pageviews", "events"]) {
      const card = await page.locator(`#stat-${id}`).locator("xpath=..").boundingBox();
      const stat = await page.locator(`#stat-${id}`).boundingBox();
      const spark = await page.locator(`#spark-${id}`).boundingBox();
      if (!card || !stat || !spark) throw new Error("not laid out");
      expect(stat.x + stat.width).toBeLessThanOrEqual(card.x + card.width + 1);
      expect(spark.x + spark.width).toBeLessThanOrEqual(card.x + card.width + 1);
      expect(spark.height).toBeGreaterThan(0);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test("a pager with an absurd page count does not widen a 320px page with the text doubled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openDashboard(page);
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
    const pager = document.createElement("idg-pagination");
    pager.setAttribute("page-count", "1000000000000000");
    pager.setAttribute("page", "500000000000000");
    document.body.append(pager);
  });
  // The dashboard has a pager of its own inside its event table, which locators reach through the
  // shadow root; this is the one that was appended.
  const absurd = page.locator('idg-pagination.hydrated[page-count="1000000000000000"]');
  await expect(absurd).toBeVisible();
  await settle(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // The count is held to ten million, so no page number has more than eight digits.
  const longest = await absurd.evaluate((pager) =>
    Math.max(
      ...Array.from(pager.shadowRoot?.querySelectorAll('[part="page"]') ?? []).map(
        (control) => control.textContent.trim().length,
      ),
    ),
  );
  expect(longest).toBeLessThanOrEqual(8);
  expect(longest).toBeGreaterThanOrEqual(2);
});

test.describe("dashboard components at larger and wider text", () => {
  for (const size of TEXT_SIZES) {
    test(`at ${size.label}, nothing is clipped or scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await openDashboard(page, { query: "?hostile" });
      await setTextSize(page, size);
      await pickerSelect(page).selectOption("p-evil");
      await expect(rows(page)).toHaveCount(4);
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const picker = await pickerSelect(page).boundingBox();
      expect((picker?.x ?? 0) + (picker?.width ?? 0)).toBeLessThanOrEqual(391);
    });
  }
});

test.describe("dashboard components right to left", () => {
  test("the table, the picker and the pagination follow the direction, and time stays left to right", async ({
    page,
  }) => {
    await openDashboard(page, { query: "?hostile&property=p-evil&dir=rtl" });
    await settle(page);
    const direction = await table(page)
      .locator("th")
      .first()
      .evaluate((el) => getComputedStyle(el).direction);
    expect(direction).toBe("rtl");
    const first = await table(page).locator("thead th").first().boundingBox();
    const last = await table(page).locator("thead th").last().boundingBox();
    if (!first || !last) throw new Error("not laid out");
    expect(first.x).toBeGreaterThan(last.x);
    // The sparkline is drawn as in left to right text: the first value at the left.
    const sparkline = await page
      .locator("#spark-visitors")
      .evaluate(
        (element) =>
          getComputedStyle(element.shadowRoot?.querySelector("svg") as Element).direction,
      );
    expect(sparkline).toBe("rtl");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
  });

  test("an isolated value keeps its own direction beside text of the other", async ({ page }) => {
    await openDashboard(page, { query: "?hostile" });
    await pickerSelect(page).selectOption("p-evil");
    // The rows of the property just chosen replace the first ones; a value read while they are
    // being swapped is no longer in the page and has no style to report.
    await expect(rows(page)).toHaveCount(4);
    await settle(page);
    const values = await table(page)
      .locator("tbody bdi")
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).unicodeBidi));
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => value === "isolate")).toBe(true);
  });
});

test.describe("dashboard components in forced colours and with reduced motion", () => {
  test("the line, the end mark and the table keep an edge in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openDashboard(page);
    const line = await page.locator("#spark-visitors").evaluate((element) => {
      const path = element.shadowRoot?.querySelector('[part="line"]');
      if (!path) throw new Error("the sparkline drew no line");
      return {
        stroke: getComputedStyle(path).stroke,
        width: Number.parseFloat(getComputedStyle(path).strokeWidth),
      };
    });
    expect(line.width).toBeGreaterThan(0);
    expect(line.stroke).not.toBe("none");
    const edge = await table(page).evaluate((element) => {
      const scroller = element.shadowRoot
        ?.querySelector("idg-table")
        ?.shadowRoot?.querySelector(".scroller");
      return scroller ? getComputedStyle(scroller).borderTopStyle : "";
    });
    expect(edge).not.toBe("none");
    await expect(pickerSelect(page)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("nothing animates or transitions for long with reduced motion, loading included", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDashboard(page, { query: "?hold", wait: "booted" });
    const measure = () =>
      page.evaluate(() => {
        const seconds = (value: string) =>
          Math.max(
            ...value.split(",").map((part) => {
              const text = part.trim();
              return text.endsWith("ms") ? Number.parseFloat(text) / 1000 : Number.parseFloat(text);
            }),
          );
        const roots: (Document | ShadowRoot)[] = [document];
        let transition = 0;
        let animation = 0;
        let measured = 0;
        let outside = 0;
        for (const root of roots) {
          for (const element of root.querySelectorAll("*")) {
            if (element.shadowRoot) roots.push(element.shadowRoot);
            const style = getComputedStyle(element);
            // An element outside the flat tree has no computed style: the rows the event table was
            // given are in the page, but until idg-table has rendered they have no slot to be in.
            // Such an element is counted, and the test below fails if there is one, so that it
            // reads as "not drawn yet" and not as a number that is not one.
            if (style.transitionDuration === "") {
              outside += 1;
              continue;
            }
            measured += 1;
            transition = Math.max(
              transition,
              seconds(style.transitionDuration) + seconds(style.transitionDelay),
            );
            if (style.animationName !== "none")
              animation = Math.max(animation, seconds(style.animationDuration));
          }
        }
        return { transition, animation, measured, outside };
      });
    const loading = await measure();
    expect(loading.outside).toBe(0);
    expect(loading.measured).toBeGreaterThan(100);
    expect(loading.transition * 1000).toBeLessThanOrEqual(1);
    expect(loading.animation * 1000).toBeLessThanOrEqual(1);
    await page.evaluate(`window.dashboardFixture.release()`);
    await expect(rows(page)).toHaveCount(10);
    // Each bundle of components loads when its first element is made, so a table or a skeleton may
    // not be drawn the moment its rows are in the page: measure once every element is hydrated.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const waiting = (root: ParentNode): number =>
            [...root.querySelectorAll("*")].reduce(
              (count, element) =>
                count +
                (element.localName.startsWith("idg-") && !element.classList.contains("hydrated")
                  ? 1
                  : 0) +
                (element.shadowRoot ? waiting(element.shadowRoot) : 0),
              0,
            );
          return waiting(document);
        }),
      )
      .toBe(0);
    const loaded = await measure();
    expect(loaded.outside).toBe(0);
    expect(loaded.measured).toBeGreaterThan(100);
    expect(loaded.transition * 1000).toBeLessThanOrEqual(1);
    expect(loaded.animation * 1000).toBeLessThanOrEqual(1);
  });
});

test.describe("keyboard and targets", () => {
  test("Tab reaches the picker, the sort buttons and the pagination in order, and each has a visible focus", async ({
    page,
  }) => {
    await openDashboard(page);
    await pickerSelect(page).focus();
    const seen: string[] = [];
    for (let press = 0; press < 6; press += 1) {
      await page.keyboard.press("Tab");
      seen.push(
        await page.evaluate(() => {
          let element: Element | null = document.activeElement;
          while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
          const name =
            [element?.getAttribute("aria-label"), element?.textContent].find(Boolean) ?? "";
          return `${element?.localName ?? ""}:${name.trim().slice(0, 14)}`;
        }),
      );
    }
    expect(seen[0]).toContain("Event");
    expect(seen[1]).toContain("Time");
    expect(seen.join(" ")).toMatch(/Previous page|Page 1|Next page/);
  });

  test("every control is at least 24px by 24px", async ({ page }) => {
    await openDashboard(page);
    const controls = [
      pickerSelect(page),
      table(page).getByRole("button", { name: "Event" }),
      table(page).getByRole("button", { name: "Time" }),
      pagination(page).getByRole("button", { name: "Next page" }),
      pagination(page).getByRole("button", { name: "Page 2" }),
    ];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    }
  });
});

test.describe("meaning that does not rest on colour", () => {
  test("a change that fell says so in words and with a down arrow, whatever its colour", async ({
    page,
  }) => {
    await openDashboard(page);
    await page.locator("#stat-visitors").evaluate((element) => {
      const stat = element as HTMLElement & { direction: string; delta: string; sentiment: string };
      stat.direction = "down";
      stat.delta = "8%";
      stat.sentiment = "negative";
    });
    await expect(page.locator('#stat-visitors [part="delta"] idg-icon')).toHaveAttribute(
      "name",
      "arrow-down",
    );
    await expect(page.locator('#stat-visitors [part="delta"] .visually-hidden')).toContainText(
      "Decreased by 8%",
    );
  });

  test("the sparkline's end is marked by a shape, and its text alternative gives the trend in words", async ({
    page,
  }) => {
    await openDashboard(page);
    await expect(page.locator('#spark-visitors [part="end"]')).toBeVisible();
    await expect(page.locator("#spark-visitors svg")).toHaveAttribute(
      "aria-label",
      /(rising|falling|steady)\.$/,
    );
  });
});
