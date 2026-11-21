import type { Locator, Page } from "@playwright/test";
import { expectNoAxeViolations } from "./accessibility";
import { LAYOUTS, applyAxes } from "./axes";
import { expect, test } from "./fixtures";

const PAGE = "/fixtures/layout-primitives.html";
const WIDTHS = [320, 768, 1280, 2560] as const;
const TAGS = [
  "idg-stack",
  "idg-cluster",
  "idg-grid",
  "idg-sidebar",
  "idg-switcher",
  "idg-cover",
  "idg-card",
  "idg-badge",
  "idg-button",
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function open(page: Page, width = 1280, layout?: string): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(PAGE);
  await expect(page.locator(TAGS.map((tag) => `${tag}:not(.hydrated)`).join(", "))).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  if (layout !== undefined) await applyAxes(page, { layout });
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not laid out");
  return box;
}

/** Sets how wide the container of a primitive is, through the style object the strict policy allows. */
async function setInlineSize(page: Page, selector: string, size: string): Promise<void> {
  await page.locator(selector).evaluate((element, value) => {
    element.style.inlineSize = value;
  }, size);
}

async function setDirection(page: Page, direction: "ltr" | "rtl"): Promise<void> {
  await page.locator("html").evaluate((element, value) => {
    element.setAttribute("dir", value);
  }, direction);
}

/** How many different offsets along an axis the elements start at, which is the number of columns or rows. */
async function distinct(locator: Locator, axis: "x" | "y"): Promise<number> {
  return locator.evaluateAll(
    (elements, key) =>
      new Set(elements.map((element) => Math.round(element.getBoundingClientRect()[key]))).size,
    axis,
  );
}

test.describe("the layout axis", () => {
  test("lists the eight layouts the tokens build, top-bar among them", () => {
    expect(LAYOUTS).toEqual([
      "bento",
      "centered",
      "dashboard",
      "immersive",
      "magazine",
      "side-rail",
      "split-hero",
      "top-bar",
    ]);
  });

  test("a page with no data-layout gets the top-bar tokens", async ({ page }) => {
    await open(page);
    const read = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return ["content-max", "columns", "grid-min", "aside-width", "nav-size"].map((name) =>
          style.getPropertyValue(`--idg-layout-${name}`).trim(),
        );
      });
    await page.locator("html").evaluate((element) => {
      element.removeAttribute("data-layout");
    });
    const bare = await read();
    await applyAxes(page, { layout: "top-bar" });
    expect(await read()).toEqual(bare);
    expect(bare.every((value) => value !== "")).toBe(true);
  });

  test("each layout sets different tokens", async ({ page }) => {
    await open(page);
    const signatures: string[] = [];
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      signatures.push(
        await page.evaluate(() => {
          const style = getComputedStyle(document.documentElement);
          return ["content-max", "columns", "grid-min", "gap", "section-gap"]
            .map((name) => style.getPropertyValue(`--idg-layout-${name}`).trim())
            .join(" | ");
        }),
      );
    }
    expect(new Set(signatures).size).toBe(LAYOUTS.length);
  });
});

test.describe("the page never scrolls sideways", () => {
  for (const layout of LAYOUTS) {
    for (const width of WIDTHS) {
      test(`${layout} at ${String(width)}px`, async ({ page }) => {
        await open(page, width, layout);
        const overflow = await page.evaluate(() => ({
          root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          body: document.body.scrollWidth - document.documentElement.clientWidth,
        }));
        // The body's own margin leaves it narrower than the viewport, which is not overflow.
        expect(Math.max(overflow.root, overflow.body)).toBeLessThanOrEqual(0);
      });
    }
  }
});

test.describe("idg-grid", () => {
  /** The grid's own measurements, with the layout's minimum track and column cap in pixels. */
  async function measure(page: Page) {
    return page.locator("#grid").evaluate((host) => {
      const grid = host.shadowRoot?.querySelector<HTMLElement>('[part="grid"]');
      if (!grid) throw new Error("no grid");
      const probe = document.createElement("div");
      probe.style.inlineSize = "var(--idg-layout-grid-min)";
      host.append(probe);
      const minimum = probe.getBoundingClientRect().width;
      probe.remove();
      const style = getComputedStyle(grid);
      return {
        width: grid.getBoundingClientRect().width,
        gap: parseFloat(style.columnGap),
        minimum,
        cap: Number(
          getComputedStyle(document.documentElement).getPropertyValue("--idg-layout-columns"),
        ),
        columns: style.gridTemplateColumns.split(" ").length,
      };
    });
  }

  test("fits as many columns as the layout's track and cap allow", async ({ page }) => {
    for (const layout of LAYOUTS) {
      await open(page, 1280, layout);
      const { width, gap, minimum, cap, columns } = await measure(page);
      const fit = Math.floor((width + gap) / (minimum + gap));
      expect(columns, layout).toBe(Math.max(1, Math.min(fit, cap)));
      expect(await distinct(page.locator("#grid > idg-card"), "x"), layout).toBe(columns);
    }
  });

  test("has a different number of columns under at least three layouts at one width", async ({
    page,
  }) => {
    const counts = new Map<string, number>();
    for (const layout of LAYOUTS) {
      await open(page, 1280, layout);
      counts.set(layout, await distinct(page.locator("#grid > idg-card"), "x"));
    }
    expect(new Set(counts.values()).size, JSON.stringify([...counts])).toBeGreaterThanOrEqual(3);
    expect(counts.get("dashboard"), "dashboard").toBeGreaterThan(counts.get("top-bar") ?? 0);
    expect(counts.get("split-hero"), "split-hero").toBeLessThan(counts.get("top-bar") ?? 0);
  });

  test("takes the gap of the layout", async ({ page }) => {
    const gaps = new Map<string, number>();
    for (const layout of ["bento", "top-bar", "split-hero"]) {
      await open(page, 1280, layout);
      gaps.set(layout, (await measure(page)).gap);
    }
    expect(gaps.get("bento")).toBeLessThan(gaps.get("top-bar") ?? 0);
    expect(gaps.get("top-bar")).toBeLessThan(gaps.get("split-hero") ?? 0);
  });

  test("is one column when its container is narrower than a track", async ({ page }) => {
    await open(page, 320, "top-bar");
    expect(await distinct(page.locator("#grid > idg-card"), "x")).toBe(1);
  });

  test("min and gap override the layout", async ({ page }) => {
    await open(page, 1280, "top-bar");
    const before = await distinct(page.locator("#grid > idg-card"), "x");
    await page.locator("#grid").evaluate((element) => {
      element.setAttribute("min", "2xl");
    });
    await expect.poll(() => distinct(page.locator("#grid > idg-card"), "x")).toBeLessThan(before);
    await page.locator("#grid").evaluate((element) => {
      element.setAttribute("min", "xs");
    });
    await expect.poll(() => distinct(page.locator("#grid > idg-card"), "x")).toBe(before);
  });

  test("ignores a value that is not a step", async ({ page }) => {
    await open(page, 1280, "top-bar");
    const before = await distinct(page.locator("#grid > idg-card"), "x");
    await page.locator("#grid").evaluate((element) => {
      element.setAttribute("min", "1px");
      element.setAttribute("gap", "url(x)");
    });
    expect(await distinct(page.locator("#grid > idg-card"), "x")).toBe(before);
  });
});

test.describe("gap none", () => {
  const PRIMITIVES = [
    ["idg-stack", "#stack", "stack"],
    ["idg-cluster", "#cluster", "cluster"],
    ["idg-grid", "#grid", "grid"],
    ["idg-sidebar", "#sidebar", "sidebar"],
    ["idg-switcher", "#switcher", "switcher"],
    ["idg-cover", "#cover-plain", "cover"],
  ] as const;

  for (const [tag, selector, part] of PRIMITIVES) {
    test(`${tag} has no gap`, async ({ page }) => {
      await open(page);
      await page.locator(selector).evaluate((element) => {
        element.setAttribute("gap", "none");
      });
      const gaps = () =>
        page
          .locator(selector)
          .locator(`[part="${part}"]`)
          .evaluate((element) => {
            const style = getComputedStyle(element);
            return [style.rowGap, style.columnGap];
          });
      await expect.poll(gaps).toEqual(["0px", "0px"]);
    });
  }

  test("idg-grid keeps its columns", async ({ page }) => {
    await open(page, 1280, "top-bar");
    const before = await distinct(page.locator("#grid > idg-card"), "x");
    expect(before).toBeGreaterThan(1);
    await page.locator("#grid").evaluate((element) => {
      element.setAttribute("gap", "none");
    });
    await expect.poll(() => distinct(page.locator("#grid > idg-card"), "x")).toBeGreaterThan(1);
  });

  test("idg-stack draws dividers with no gap around them", async ({ page }) => {
    await open(page);
    await page.locator("#stack-dividers").evaluate((element) => {
      element.setAttribute("gap", "none");
    });
    await expect
      .poll(() =>
        page
          .locator("#stack-dividers > p")
          .nth(1)
          .evaluate((element) => getComputedStyle(element).paddingBlockStart),
      )
      .toBe("0px");
  });
});

test.describe("idg-sidebar", () => {
  const side = (page: Page, id: string) => page.locator(`#${id}`).locator('[part="side"]');
  const content = (page: Page, id: string) => page.locator(`#${id}`).locator('[part="content"]');

  test("puts the side region and the content in one row when the container is wide", async ({
    page,
  }) => {
    await open(page);
    await setInlineSize(page, "#sidebar-box", "60rem");
    const s = await boxOf(side(page, "sidebar"));
    const c = await boxOf(content(page, "sidebar"));
    expect(Math.abs(s.y - c.y)).toBeLessThan(1);
    expect(s.x + s.width).toBeLessThanOrEqual(c.x + 1);
    expect(c.width).toBeGreaterThan(s.width);
  });

  test("stacks the regions when the content would get less than half the container", async ({
    page,
  }) => {
    await open(page);
    await setInlineSize(page, "#sidebar-box", "60rem");
    await setInlineSize(page, "#sidebar-box", "22rem");
    const s = await boxOf(side(page, "sidebar"));
    const c = await boxOf(content(page, "sidebar"));
    expect(c.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
    expect(Math.abs(s.x - c.x)).toBeLessThan(1);
    expect(c.width).toBeGreaterThan(300);
  });

  test("wraps on the container's width, not the viewport's", async ({ page }) => {
    await open(page, 2560);
    await setInlineSize(page, "#sidebar-box", "22rem");
    const s = await boxOf(side(page, "sidebar"));
    const c = await boxOf(content(page, "sidebar"));
    expect(c.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
  });

  test("side-width changes how much room the side region takes", async ({ page }) => {
    await open(page);
    await setInlineSize(page, "#sidebar-box", "60rem");
    const before = (await boxOf(side(page, "sidebar"))).width;
    await page.locator("#sidebar").evaluate((element) => {
      element.setAttribute("side-width", "s");
    });
    await expect.poll(async () => (await boxOf(side(page, "sidebar"))).width).toBeLessThan(before);
  });

  test("the side region at the end is drawn after the content, and stacks below it", async ({
    page,
  }) => {
    await open(page);
    await setInlineSize(page, "#sidebar-end-box", "60rem");
    const s = await boxOf(side(page, "sidebar-end"));
    const c = await boxOf(content(page, "sidebar-end"));
    expect(c.x + c.width).toBeLessThanOrEqual(s.x + 1);
    await setInlineSize(page, "#sidebar-end-box", "22rem");
    const stackedSide = await boxOf(side(page, "sidebar-end"));
    const stackedContent = await boxOf(content(page, "sidebar-end"));
    expect(stackedSide.y).toBeGreaterThanOrEqual(stackedContent.y + stackedContent.height - 1);
  });

  test("keeps the reading order: the focus order follows the side that is first", async ({
    page,
  }) => {
    await open(page);
    await page.locator("#sidebar-last-link").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#sidebar-content-link")).toBeFocused();
    await page.locator("#sidebar-end-content-link").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#sidebar-end-side-link")).toBeFocused();
  });
});

test.describe("idg-switcher", () => {
  const items = (page: Page, id: string) => page.locator(`#${id} > idg-card`);

  test("is one row when the container is wider than the threshold", async ({ page }) => {
    await open(page);
    await setInlineSize(page, "#switcher-box", "60rem");
    expect(await distinct(items(page, "switcher"), "y")).toBe(1);
    expect(await distinct(items(page, "switcher"), "x")).toBe(3);
    const widths = await items(page, "switcher").evaluateAll((cards) =>
      cards.map((card) => Math.round(card.getBoundingClientRect().width)),
    );
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  test("is one column when the container is narrower than the threshold", async ({ page }) => {
    await open(page);
    await setInlineSize(page, "#switcher-box", "60rem");
    await setInlineSize(page, "#switcher-box", "24rem");
    expect(await distinct(items(page, "switcher"), "x")).toBe(1);
    expect(await distinct(items(page, "switcher"), "y")).toBe(3);
  });

  test("switches on the container's width, not the viewport's", async ({ page }) => {
    await open(page, 2560);
    await setInlineSize(page, "#switcher-box", "24rem");
    expect(await distinct(items(page, "switcher"), "x")).toBe(1);
  });

  test("threshold moves the point where it switches", async ({ page }) => {
    await open(page);
    await setInlineSize(page, "#switcher-small-box", "30rem");
    expect(await distinct(items(page, "switcher-small"), "x")).toBe(3);
    await page.locator("#switcher-small").evaluate((element) => {
      element.setAttribute("threshold", "xl");
    });
    await expect.poll(() => distinct(items(page, "switcher-small"), "x")).toBe(1);
  });

  test("limit stacks more items than it allows at any width, and not fewer", async ({ page }) => {
    await open(page, 2560);
    await setInlineSize(page, "#switcher-limit-box", "100%");
    expect(await distinct(items(page, "switcher-limit"), "x")).toBe(1);
    await page.locator("#switcher-limit").evaluate((element) => {
      element.setAttribute("limit", "5");
    });
    await expect.poll(() => distinct(items(page, "switcher-limit"), "y")).toBe(1);
    await page.locator("#switcher-limit").evaluate((element) => {
      element.setAttribute("limit", "4");
    });
    await expect.poll(() => distinct(items(page, "switcher-limit"), "x")).toBe(1);
  });
});

test.describe("idg-stack", () => {
  const children = (page: Page, id: string) => page.locator(`#${id} > p`);

  test("lays children one under another in source order", async ({ page }) => {
    await open(page);
    const ys = await children(page, "stack").evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().y),
    );
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(new Set(ys).size).toBe(ys.length);
  });

  test("gap sets the space between children", async ({ page }) => {
    await open(page);
    const space = async () => {
      const [a, b] = await Promise.all([
        boxOf(children(page, "stack").nth(0)),
        boxOf(children(page, "stack").nth(1)),
      ]);
      return b.y - (a.y + a.height);
    };
    await page.locator("#stack").evaluate((element) => {
      element.setAttribute("gap", "xs");
    });
    await expect.poll(space).toBeGreaterThan(8);
    const small = await space();
    await page.locator("#stack").evaluate((element) => {
      element.setAttribute("gap", "2xl");
    });
    await expect.poll(space).toBeGreaterThan(small * 3);
    await page.locator("#stack").evaluate((element) => {
      element.setAttribute("gap", "none");
    });
    await expect.poll(space).toBeLessThan(2);
  });

  test("dividers rule every child but the first", async ({ page }) => {
    await open(page);
    const rules = await children(page, "stack-dividers").evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).borderBlockStartWidth),
    );
    expect(rules[0]).toBe("0px");
    expect(rules.slice(1).every((width) => width !== "0px")).toBe(true);
    const plain = await children(page, "stack").evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).borderBlockStartWidth),
    );
    expect(plain.every((width) => width === "0px")).toBe(true);
  });

  test("align moves children to the inline start, centre and end", async ({ page }) => {
    await open(page);
    const offsets = async () => {
      const stack = await boxOf(page.locator("#stack-aligned"));
      const child = await boxOf(page.locator("#stack-aligned > .tag").first());
      return { start: child.x - stack.x, end: stack.x + stack.width - (child.x + child.width) };
    };
    for (const align of ["start", "center", "end"]) {
      await page.locator("#stack-aligned").evaluate((element, value) => {
        element.setAttribute("align", value);
      }, align);
      await expect
        .poll(async () => {
          const { start, end } = await offsets();
          if (align === "start") return start < 1 && end > 20;
          if (align === "end") return end < 1 && start > 20;
          return Math.abs(start - end) < 1.5 && start > 20;
        })
        .toBe(true);
    }
  });
});

test.describe("idg-cluster", () => {
  const items = (page: Page) => page.locator("#cluster > idg-badge");

  test("keeps its items in one row while there is room, and wraps them when there is not", async ({
    page,
  }) => {
    await open(page);
    await setInlineSize(page, "#cluster-box", "100%");
    expect(await distinct(items(page), "y")).toBe(1);
    await setInlineSize(page, "#cluster-box", "14rem");
    expect(await distinct(items(page), "y")).toBeGreaterThan(1);
  });

  test("justify between pushes the first and last items to the edges", async ({ page }) => {
    await open(page);
    await page.locator("#cluster").evaluate((element) => {
      element.setAttribute("justify", "between");
    });
    await setInlineSize(page, "#cluster-box", "100%");
    const host = await boxOf(page.locator("#cluster"));
    await expect
      .poll(async () => {
        const first = await boxOf(items(page).first());
        const last = await boxOf(items(page).last());
        return (
          Math.abs(first.x - host.x) < 1 &&
          Math.abs(host.x + host.width - (last.x + last.width)) < 1
        );
      })
      .toBe(true);
  });
});

test.describe("idg-cover", () => {
  test("is at least as tall as its minimum, and centres its content", async ({ page }) => {
    await open(page);
    const cover = await boxOf(page.locator("#cover-plain"));
    const content = await boxOf(page.locator("#cover-plain").locator('[part="center"]'));
    expect(cover.height).toBeGreaterThanOrEqual(319);
    expect(Math.abs(content.y + content.height / 2 - (cover.y + cover.height / 2))).toBeLessThan(
      1.5,
    );
  });

  test("screen fills the viewport", async ({ page }) => {
    await open(page);
    await page.locator("#cover-plain").evaluate((element) => {
      element.setAttribute("min-height", "screen");
    });
    await expect
      .poll(async () => (await boxOf(page.locator("#cover-plain"))).height)
      .toBeGreaterThanOrEqual(900);
  });

  test("keeps the top region above and the bottom region below the content", async ({ page }) => {
    await open(page);
    const top = await boxOf(page.locator("#cover-top"));
    const centre = await boxOf(page.locator("#cover").locator('[part="center"]'));
    const bottom = await boxOf(page.locator("#cover-bottom"));
    const cover = await boxOf(page.locator("#cover"));
    expect(top.y).toBeLessThan(centre.y);
    expect(centre.y + centre.height).toBeLessThanOrEqual(bottom.y + 1);
    expect(top.y - cover.y).toBeLessThan(1);
    expect(cover.y + cover.height - (bottom.y + bottom.height)).toBeLessThan(1);
  });

  test("grows past its minimum when the content needs more room", async ({ page }) => {
    await open(page, 320);
    const cover = await boxOf(page.locator("#cover-tall"));
    expect(cover.height).toBeGreaterThan(160);
  });
});

test.describe("the layout primitives in a right-to-left page", () => {
  test("the side region at the start is at the right, and at the end at the left", async ({
    page,
  }) => {
    await open(page);
    await setInlineSize(page, "#sidebar-box", "60rem");
    await setInlineSize(page, "#sidebar-end-box", "60rem");
    await setDirection(page, "rtl");
    const start = await boxOf(page.locator("#sidebar").locator('[part="side"]'));
    const startContent = await boxOf(page.locator("#sidebar").locator('[part="content"]'));
    expect(start.x).toBeGreaterThanOrEqual(startContent.x + startContent.width - 1);
    const end = await boxOf(page.locator("#sidebar-end").locator('[part="side"]'));
    const endContent = await boxOf(page.locator("#sidebar-end").locator('[part="content"]'));
    expect(end.x + end.width).toBeLessThanOrEqual(endContent.x + 1);
  });

  test("a cluster starts at the right and a stack aligns to the right", async ({ page }) => {
    await open(page);
    await setDirection(page, "rtl");
    const host = await boxOf(page.locator("#cluster"));
    const first = await boxOf(page.locator("#cluster > idg-badge").first());
    expect(host.x + host.width - (first.x + first.width)).toBeLessThan(1);
    await page.locator("#stack-aligned").evaluate((element) => {
      element.setAttribute("align", "start");
    });
    await expect
      .poll(async () => {
        const stack = await boxOf(page.locator("#stack-aligned"));
        const child = await boxOf(page.locator("#stack-aligned > .tag").first());
        return stack.x + stack.width - (child.x + child.width);
      })
      .toBeLessThan(1);
  });

  test("a switcher puts its first item at the right", async ({ page }) => {
    await open(page);
    await setInlineSize(page, "#switcher-box", "60rem");
    await setDirection(page, "rtl");
    const first = await boxOf(page.locator("#switcher > idg-card").first());
    const last = await boxOf(page.locator("#switcher > idg-card").last());
    expect(first.x).toBeGreaterThan(last.x);
  });

  test("a grid puts its first item at the right and does not overflow", async ({ page }) => {
    await open(page, 768, "dashboard");
    await setDirection(page, "rtl");
    const first = await boxOf(page.locator("#grid > idg-card").first());
    const second = await boxOf(page.locator("#grid > idg-card").nth(1));
    expect(first.x).toBeGreaterThan(second.x);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
});

test.describe("accessibility", () => {
  for (const layout of LAYOUTS) {
    test(`has no axe violations under ${layout}`, async ({ page }) => {
      await open(page, 1280, layout);
      await expectNoAxeViolations(page);
    });
  }

  test("has no axe violations at a narrow width, with the regions stacked", async ({ page }) => {
    await open(page, 320);
    await expectNoAxeViolations(page);
  });

  test("adds no landmark or role of its own", async ({ page }) => {
    await open(page);
    const roles = await page.evaluate(
      () =>
        Array.from(
          document.querySelectorAll(
            "idg-stack, idg-cluster, idg-grid, idg-sidebar, idg-switcher, idg-cover",
          ),
        ).flatMap((host) =>
          Array.from(
            host.shadowRoot?.querySelectorAll("[role], [aria-label], [aria-labelledby]") ?? [],
          ),
        ).length,
    );
    expect(roles).toBe(0);
  });
});
