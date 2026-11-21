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

test.describe("items that draw nothing", () => {
  test("a switcher limit does not count hidden items, templates or items for another slot", async ({
    page,
  }) => {
    await open(page, 2560);
    await page.locator("#switcher-limit").evaluate((element) => {
      element.setAttribute("limit", "5");
      for (const extra of [document.createElement("p"), document.createElement("template")]) {
        extra.hidden = true;
        element.append(extra);
      }
      const other = document.createElement("p");
      other.slot = "elsewhere";
      element.append(other);
    });
    await expect.poll(() => distinct(page.locator("#switcher-limit > idg-card"), "y")).toBe(1);
  });

  test("a switcher limit counts a hidden item once it is shown", async ({ page }) => {
    await open(page, 2560);
    await page.locator("#switcher-limit").evaluate((element) => {
      element.setAttribute("limit", "5");
      const extra = document.createElement("p");
      extra.id = "extra";
      extra.hidden = true;
      extra.textContent = "Extra";
      element.append(extra);
    });
    await expect.poll(() => distinct(page.locator("#switcher-limit > idg-card"), "y")).toBe(1);
    await page.locator("#extra").evaluate((element) => {
      element.removeAttribute("hidden");
    });
    await expect.poll(() => distinct(page.locator("#switcher-limit > idg-card"), "x")).toBe(1);
  });

  test("a switcher limit counts items forwarded to it through another slot", async ({ page }) => {
    await open(page, 2560);
    const stacked = () =>
      page
        .locator("#forwarded")
        .evaluate((host) =>
          host.shadowRoot
            ?.querySelector("idg-switcher")
            ?.shadowRoot?.querySelector(".switcher")
            ?.classList.contains("over-limit"),
        );
    await expect.poll(stacked).toBe(true);
    await page
      .locator("#forwarded > p")
      .last()
      .evaluate((element) => {
        element.remove();
      });
    await expect.poll(stacked).toBe(false);
  });

  test("a sidebar with nothing at its side gives the content the whole row", async ({ page }) => {
    await open(page);
    const host = await boxOf(page.locator("#sidebar-empty"));
    const content = await boxOf(page.locator("#sidebar-empty").locator('[part="content"]'));
    expect(Math.abs(content.width - host.width)).toBeLessThan(1);
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

test.describe("large text", () => {
  for (const layout of LAYOUTS) {
    test(`the page does not scroll sideways at 320px with the text doubled, under ${layout}`, async ({
      page,
    }) => {
      await open(page, 320, layout);
      await page.locator("html").evaluate((element) => {
        element.style.fontSize = "200%";
      });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("a rule between stack items", () => {
  test("an idg-divider between items is a rule with the stack's gap on both sides", async ({
    page,
  }) => {
    await open(page);
    const gap = await page
      .locator("#stack-dividers")
      .locator('[part="stack"]')
      .evaluate((element) => parseFloat(getComputedStyle(element).rowGap));
    expect(gap).toBeGreaterThan(8);
    const boxes = await page
      .locator("#stack-dividers > p, #stack-dividers > idg-divider")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const { y, height } = element.getBoundingClientRect();
          return { tag: element.tagName, y, height };
        }),
      );
    expect(boxes.map((box) => box.tag)).toEqual(["P", "IDG-DIVIDER", "P", "IDG-DIVIDER", "P"]);
    for (let index = 1; index < boxes.length; index += 1) {
      const above = boxes[index - 1];
      const box = boxes[index];
      if (!above || !box) throw new Error("missing box");
      expect(box.y - (above.y + above.height)).toBeCloseTo(gap, 0);
      if (box.tag === "IDG-DIVIDER") expect(box.height).toBeGreaterThanOrEqual(1);
    }
  });

  for (const direction of ["ltr", "rtl"] as const) {
    for (const align of ["stretch", "start", "center", "end"] as const) {
      test(`a horizontal idg-divider spans the stack under align ${align} in ${direction}`, async ({
        page,
      }) => {
        await open(page);
        await setDirection(page, direction);
        await page.locator("#stack-dividers").evaluate((element, value) => {
          element.setAttribute("align", value);
        }, align);
        await expect
          .poll(() =>
            page
              .locator("#stack-dividers")
              .locator('[part="stack"]')
              .evaluate((element) => element.getAttribute("class") ?? ""),
          )
          .toContain(`align-${align}`);
        const widths = await page.locator("#stack-dividers").evaluate((element) => {
          const stack = element.shadowRoot?.querySelector('[part="stack"]');
          if (!stack) throw new Error("no stack part");
          const style = getComputedStyle(stack);
          const inner =
            stack.getBoundingClientRect().width -
            parseFloat(style.paddingInlineStart) -
            parseFloat(style.paddingInlineEnd);
          return {
            inner,
            dividers: Array.from(element.querySelectorAll("idg-divider")).map(
              (divider) => divider.getBoundingClientRect().width,
            ),
          };
        });
        expect(widths.inner).toBeGreaterThan(100);
        expect(widths.dividers).toHaveLength(2);
        for (const width of widths.dividers) expect(width).toBeCloseTo(widths.inner, 0);
      });
    }
  }

  test("a vertical idg-divider in a cluster spans the height of the row", async ({ page }) => {
    await open(page);
    const heights = await page.locator("#cluster-divider").evaluate((element) => {
      const cluster = element.shadowRoot?.querySelector('[part="cluster"]');
      const divider = element.querySelector("idg-divider");
      const card = element.querySelector("idg-card");
      if (!cluster || !divider || !card) throw new Error("missing part");
      return {
        row: cluster.getBoundingClientRect().height,
        divider: divider.getBoundingClientRect().height,
        line: (divider.shadowRoot?.querySelector(".line") ?? divider).getBoundingClientRect()
          .height,
        card: card.getBoundingClientRect().height,
      };
    });
    expect(heights.card).toBeGreaterThan(40);
    expect(heights.divider).toBeCloseTo(heights.row, 0);
    expect(heights.line).toBeCloseTo(heights.row, 0);
  });

  test("a dividers attribute draws nothing and changes nothing", async ({ page }) => {
    await open(page);
    const seen = await page.locator("#stack-unknown").evaluate((element) => {
      const stack = element.shadowRoot?.querySelector('[part="stack"]');
      if (!stack) throw new Error("no stack part");
      const style = getComputedStyle(stack);
      return {
        clipPath: style.clipPath,
        marginBlockStart: style.marginBlockStart,
        host: getComputedStyle(element).display,
        borders: Array.from(element.children).map(
          (child) => getComputedStyle(child).borderBlockStartWidth,
        ),
        padding: Array.from(element.children).map(
          (child) => getComputedStyle(child).paddingBlockStart,
        ),
      };
    });
    expect(seen).toEqual({
      clipPath: "none",
      marginBlockStart: "0px",
      host: "block",
      borders: ["0px", "0px"],
      padding: ["0px", "0px"],
    });
  });

  test("glass cards in a stack keep their backdrop: nothing around them isolates it", async ({
    page,
  }) => {
    await open(page);
    await applyAxes(page, { design: "glass" });
    const found = await page.locator("#stack-glass").evaluate((host) => {
      const stack = host.shadowRoot?.querySelector('[part="stack"]');
      if (!stack) throw new Error("no stack part");
      const isolating = (element: Element) => {
        const style = getComputedStyle(element);
        const problems: string[] = [];
        if (style.clipPath !== "none") problems.push("clip-path");
        if (style.filter !== "none") problems.push("filter");
        if (style.backdropFilter !== "none") problems.push("backdrop-filter");
        if (style.overflowX !== "visible" || style.overflowY !== "visible")
          problems.push("overflow");
        if (style.contain !== "none") problems.push("contain");
        if (style.mixBlendMode !== "normal") problems.push("mix-blend-mode");
        if (style.opacity !== "1") problems.push("opacity");
        if (style.willChange !== "auto") problems.push("will-change");
        return problems;
      };
      return {
        stack: isolating(stack),
        host: isolating(host),
        blur: Array.from(host.children).map((card) => {
          const surface = card.shadowRoot?.querySelector('[part="card"]');
          return surface ? getComputedStyle(surface).backdropFilter : "missing";
        }),
      };
    });
    expect(found.stack).toEqual([]);
    expect(found.host).toEqual([]);
    expect(found.blur).toHaveLength(2);
    for (const blur of found.blur) expect(blur).toMatch(/blur/);
  });
});

test.describe("the primitives leave their content alone", () => {
  const HOSTS = ["r-stack", "r-cluster", "r-grid", "r-sidebar", "r-switcher", "r-cover"] as const;

  for (const host of HOSTS) {
    test.describe(host, () => {
      test("a table wider than its container scrolls inside its own frame, and breaks no word", async ({
        page,
      }) => {
        // At the width of a phone, where the table is wider than the viewport as well as its container.
        await open(page, 320);
        await setInlineSize(page, `#${host}-box`, "16rem");
        const table = page.locator(`#${host} idg-table`);
        const frame = table.locator('[part="scroller"]');
        await expect
          .poll(() => frame.evaluate((element) => element.scrollWidth > element.clientWidth))
          .toBe(true);
        const wraps = await table.evaluate((element) =>
          Array.from(element.querySelectorAll("th, td")).map(
            (cell) => getComputedStyle(cell).overflowWrap,
          ),
        );
        expect(new Set(wraps)).toEqual(new Set(["normal"]));
        const page_ = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(page_).toBeLessThanOrEqual(0);
      });

      test("a button label and a flex label break no word and keep the width of their longest", async ({
        page,
      }) => {
        await open(page);
        const word = await boxOf(page.locator("#alone-label"));
        await setInlineSize(page, `#${host}-box`, "8rem");
        const wraps = await page
          .locator(`#${host}`)
          .evaluate((element) =>
            [
              element.querySelector("idg-button")?.shadowRoot?.querySelector(".label"),
              element.querySelector(".pill"),
            ].map((label) => (label ? getComputedStyle(label).overflowWrap : "missing")),
          );
        expect(wraps).toEqual(["normal", "normal"]);
        expect((await boxOf(page.locator(`#${host} .pill`))).width).toBeGreaterThanOrEqual(
          word.width - 1,
        );
        expect((await boxOf(page.locator(`#${host} idg-button`))).width).toBeGreaterThanOrEqual(
          word.width,
        );
      });

      test("an image keeps its aspect ratio", async ({ page }) => {
        await open(page);
        await setInlineSize(page, `#${host}-box`, "12rem");
        const image = await boxOf(page.locator(`#${host} img`));
        expect(image.width / image.height).toBeCloseTo(3, 1);
      });
    });
  }
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
