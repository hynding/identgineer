import type { Page } from "@playwright/test";
import { LAYOUTS } from "./axes";
import { expect, test } from "./fixtures";
import {
  focusInfo,
  frames,
  openShell,
  regions,
  setLayout,
  setShellWidth,
  tabStops,
  type Rect,
  type Regions,
} from "./layout-shell-page";

/** What a page puts into the shell that the fixture does not, so the layouts are held to it. */
type Change =
  | "many-items"
  | "long-label"
  | "long-brand"
  | "wide-hero-text"
  | "no-hero"
  | "no-aside"
  | "no-actions"
  | "no-hero-or-aside";

async function change(page: Page, kind: Change): Promise<void> {
  await page.evaluate((what) => {
    const host = document.getElementById("shell");
    if (!host) throw new Error("no shell");
    const remove = (slot: string) => {
      host.querySelectorAll(`[slot="${slot}"]`).forEach((n) => {
        n.remove();
      });
    };
    if (what === "many-items") {
      for (let index = 0; index < 20; index += 1) {
        const link = document.createElement("a");
        link.slot = "navigation";
        link.href = `#item-${String(index)}`;
        link.id = `item-${String(index)}`;
        link.textContent = `Item ${String(index)}`;
        host.append(link);
      }
    }
    if (what === "long-label") {
      const link = document.createElement("a");
      link.slot = "navigation";
      link.href = "#long";
      link.id = "long-label";
      link.textContent =
        "A navigation label that is far longer than any of the others and keeps going";
      host.querySelector('[slot="navigation"]')?.after(link);
    }
    if (what === "long-brand") {
      const brand = host.querySelector('[slot="brand"]');
      if (brand) brand.append(" International Association of Engineers and Designers");
    }
    if (what === "wide-hero-text") {
      host
        .querySelectorAll<HTMLElement>('[slot="hero"] *')
        .forEach((element) => (element.style.letterSpacing = "0.06em"));
    }
    if (what === "no-hero" || what === "no-hero-or-aside") remove("hero");
    if (what === "no-aside" || what === "no-hero-or-aside") remove("aside");
    if (what === "no-actions") remove("actions");
  }, kind);
  await frames(page, 3);
}

function overlap(a: Rect, b: Rect): boolean {
  if (!a.shown || !b.shown) return false;
  const across = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const down = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return across > 1 && down > 1;
}

/** The pairs of regions that sit over one another, other than where a layout means them to. */
function collisions(layout: string, found: Regions, overHero = true): string[] {
  const names = [
    "brand",
    "toggle",
    "navigation",
    "actions",
    "hero",
    "main",
    "aside",
    "footer",
  ] as const;
  const header = new Set(["brand", "toggle", "navigation", "actions"]);
  const problems: string[] = [];
  for (let first = 0; first < names.length; first += 1) {
    for (let second = first + 1; second < names.length; second += 1) {
      const a = names[first];
      const b = names[second];
      if (!a || !b || !overlap(found[a], found[b])) continue;
      const heroPair = a === "hero" || b === "hero" ? (a === "hero" ? b : a) : undefined;
      // The header is laid over the hero in immersive, and the brand over it in a split hero.
      if (overHero && layout === "immersive" && heroPair && header.has(heroPair)) continue;
      if (overHero && layout === "split-hero" && heroPair === "brand") continue;
      // The brand sits on the top of a rail, over the padding the navigation leaves for it.
      if ((layout === "side-rail" || layout === "dashboard") && a === "brand" && b === "navigation")
        continue;
      problems.push(`${a} overlaps ${b}`);
    }
  }
  return problems;
}

function sideways(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - document.documentElement.clientWidth,
    ),
  );
}

const WIDTHS = [320, 390, 768, 1280, 1600] as const;

test.describe("a page that puts more in the shell than the fixture does", () => {
  for (const kind of ["many-items", "long-label"] as const) {
    test(`${kind}: the navigation stays clear of the content and the page does not scroll sideways, in every layout`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openShell(page);
      await change(page, kind);
      for (const layout of LAYOUTS) {
        await setLayout(page, layout);
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 800 });
          await frames(page, 3);
          const found = await regions(page);
          const label = `${layout} at ${String(width)}`;
          expect(collisions(layout, found), label).toEqual([]);
          expect(await sideways(page), `${label} scrolls sideways`).toBeLessThanOrEqual(0);
        }
      }
    });
  }

  test("a long brand neither scrolls the page sideways nor is clipped, in every layout at 320px and 1280px", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openShell(page);
    await change(page, "long-brand");
    for (const layout of LAYOUTS) {
      await setLayout(page, layout);
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await frames(page, 3);
        const label = `${layout} at ${String(width)}`;
        expect(await sideways(page), label).toBeLessThanOrEqual(0);
        const clipped = await page.locator("#shell").evaluate((host) => {
          const brand = host.shadowRoot?.querySelector<HTMLElement>('[part="brand"]');
          return brand ? brand.scrollWidth - brand.clientWidth : 0;
        });
        expect(clipped, `${label} clips the brand`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("hero text wider than its column does not scroll the page sideways at 320px with the root font at 200%", async ({
    page,
  }) => {
    await openShell(page, { width: 320, fontSize: "200%" });
    await change(page, "wide-hero-text");
    for (const layout of LAYOUTS) {
      await setLayout(page, layout);
      await frames(page, 3);
      expect(await sideways(page), layout).toBeLessThanOrEqual(0);
    }
  });

  for (const kind of ["no-hero", "no-aside", "no-actions", "no-hero-or-aside"] as const) {
    test(`${kind}: nothing sits over anything else, in every layout`, async ({ page }) => {
      test.setTimeout(120_000);
      await openShell(page);
      await change(page, kind);
      for (const layout of LAYOUTS) {
        await setLayout(page, layout);
        for (const width of [390, 768, 1280]) {
          await page.setViewportSize({ width, height: 800 });
          await frames(page, 3);
          const found = await regions(page);
          const label = `${layout} at ${String(width)}`;
          // Without a hero there is nothing for a header to be laid over.
          const only = collisions(layout, found, found.hero.shown);
          expect(only, label).toEqual([]);
          expect(await sideways(page), label).toBeLessThanOrEqual(0);
        }
      }
    });
  }

  test("without a hero, the immersive header is part of the page on a surface of its own", async ({
    page,
  }) => {
    await openShell(page, { layout: "immersive" });
    await change(page, "no-hero");
    const header = await page.locator("#shell").evaluate((host) => {
      const element = host.shadowRoot?.querySelector<HTMLElement>('[part="header"]');
      if (!element) throw new Error("no header");
      const style = getComputedStyle(element);
      return { position: style.position, background: style.backgroundColor };
    });
    expect(header.position).not.toBe("absolute");
    expect(header.background).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("without a hero, a split hero is one column, not a column and an empty half", async ({
    page,
  }) => {
    await openShell(page, { layout: "split-hero" });
    await change(page, "no-hero");
    const found = await regions(page);
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(found.main.width).toBeGreaterThan(width * 0.55);
    expect(found.main.x).toBeLessThan(width * 0.3);
  });
});

test.describe("a long navigation in a rail", () => {
  for (const layout of ["side-rail", "dashboard"]) {
    test(`${layout}: a focused item is never under the brand, however short the window`, async ({
      page,
    }) => {
      await openShell(page, { width: 1280, height: 500, layout });
      await change(page, "many-items");
      const ids = [
        "nav-first",
        ...Array.from({ length: 20 }, (_, index) => `item-${String(index)}`),
      ];
      // Down the list and back up, so the scroll has to bring an item up to the top edge too.
      for (const id of [...ids, ...[...ids].reverse()]) {
        await page.locator(`#${id}`).focus();
        await frames(page, 1);
        const covered = await page.locator("#shell").evaluate((host, target) => {
          const brand = host.shadowRoot?.querySelector<HTMLElement>('[part="brand"]');
          const item = document.getElementById(target);
          if (!brand || !item) throw new Error("missing");
          return brand.getBoundingClientRect().bottom - item.getBoundingClientRect().top;
        }, id);
        expect(covered, `${id} under the brand`).toBeLessThanOrEqual(1);
      }
    });

    test(`${layout}: the brand has a surface of its own, so items scrolling past it are not seen through it`, async ({
      page,
    }) => {
      await openShell(page, { width: 1280, layout });
      const background = await page.locator("#shell").evaluate((host) => {
        const brand = host.shadowRoot?.querySelector<HTMLElement>('[part="brand"]');
        if (!brand) throw new Error("no brand");
        const style = getComputedStyle(brand);
        return `${style.backgroundColor} ${style.backgroundImage}`;
      });
      expect(background).not.toBe("rgba(0, 0, 0, 0) none");
    });
  }
});

test.describe("Tab order with the navigation open as a panel", () => {
  const RANK = [
    "skip",
    "brand",
    "toggle",
    "close",
    "navigation",
    "actions",
    "hero",
    "main",
    "aside",
    "footer",
  ];

  for (const width of [390, 768]) {
    for (const layout of ["top-bar", "bento", "split-hero", "magazine", "centered"]) {
      test(`${layout} at ${String(width)}px: the panel is followed by the actions, never preceded by a jump up`, async ({
        page,
      }) => {
        await openShell(page, { width, layout });
        const toggle = page.locator("#shell").locator('[part="toggle"]');
        if (!(await toggle.isVisible())) return;
        await toggle.click();
        await expect
          .poll(() =>
            page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")),
          )
          .toBe(true);
        await frames(page, 3);
        const modal = await page
          .locator("#shell")
          .evaluate((host) => host.shadowRoot?.querySelector("dialog")?.matches(":modal") ?? false);
        if (modal) return;
        const stops = await tabStops(page);
        const ranks = stops.map((stop) => RANK.indexOf(stop.region));
        expect(ranks, "regions in the order of the markup").toEqual(
          [...ranks].sort((a, b) => a - b),
        );
        for (let index = 1; index < stops.length; index += 1) {
          const previous = stops[index - 1];
          const next = stops[index];
          if (!previous || !next) continue;
          const above = next.rect.bottom <= previous.rect.y + 1;
          const before = next.rect.x < previous.rect.right - 1;
          expect(
            above && before,
            `${previous.region}#${previous.id} -> ${next.region}#${next.id} jumps back up`,
          ).toBe(false);
        }
      });
    }
  }
});

test.describe("the Escape key and closing from the page", () => {
  async function openPanel(page: Page): Promise<void> {
    await openShell(page, { width: 390, layout: "top-bar" });
    await page.locator("#shell").locator('[part="toggle"]').click();
    await expect
      .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
      .toBe(true);
    await frames(page, 3);
  }

  const isOpen = (page: Page) =>
    page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open"));

  test("Escape in the content of the page leaves focus where it is", async ({ page }) => {
    await openPanel(page);
    await page.locator("#main-link").focus();
    await page.keyboard.press("Escape");
    await frames(page, 3);
    expect(await focusInfo(page)).toEqual({ region: "main", id: "main-link" });
    expect(await isOpen(page)).toBe(true);
  });

  test("Escape that a control in the page uses is not also a request to close the panel", async ({
    page,
  }) => {
    await openPanel(page);
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.id = "own-escape";
      input.setAttribute("aria-label", "Search");
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") event.preventDefault();
      });
      document.getElementById("shell")?.append(input);
    });
    await page.locator("#own-escape").focus();
    await page.keyboard.press("Escape");
    await frames(page, 3);
    expect(await isOpen(page)).toBe(true);
    expect(await focusInfo(page)).toEqual({ region: "main", id: "own-escape" });
  });

  test("Escape in the panel closes it and returns focus to the menu button", async ({ page }) => {
    await openPanel(page);
    await page.locator("#nav-first").focus();
    await page.keyboard.press("Escape");
    await expect.poll(() => isOpen(page)).toBe(false);
    expect(await focusInfo(page)).toMatchObject({ region: "toggle" });
  });

  test("closing from the page leaves focus in the content where the page put it", async ({
    page,
  }) => {
    await openPanel(page);
    await page.locator("#main-link").focus();
    await page.locator("#shell").evaluate((host) => {
      (host as HTMLElement & { navigationOpen: boolean }).navigationOpen = false;
    });
    await frames(page, 3);
    expect(await isOpen(page)).toBe(false);
    expect(await focusInfo(page)).toEqual({ region: "main", id: "main-link" });
  });

  test("a click that is not a plain one on a link does not close the panel", async ({ page }) => {
    await openPanel(page);
    await page.locator("#nav-first").click({ modifiers: ["Shift"] });
    await frames(page, 3);
    expect(await isOpen(page)).toBe(true);
  });
});

test.describe("a drawer left open while the container grows", () => {
  test("with focus on its Close button, focus goes to the navigation that is now drawn", async ({
    page,
  }) => {
    await openShell(page, { width: 1280, layout: "side-rail" });
    await setShellWidth(page, "390px");
    await frames(page, 3);
    await page.locator("#shell").locator('[part="toggle"]').click();
    await expect
      .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
      .toBe(true);
    await page.locator("#shell").locator('[part="close"]').focus();
    await setShellWidth(page, "");
    await expect.poll(() => focusInfo(page)).toMatchObject({ region: "navigation" });
  });
});

test.describe("a shell inside a page", () => {
  test("claims the height of the window unless it is embedded", async ({ page }) => {
    await openShell(page, { height: 800 });
    const minimum = () =>
      page.locator("#shell").evaluate((host) => {
        const shell = host.shadowRoot?.querySelector<HTMLElement>('[part="shell"]');
        return shell ? getComputedStyle(shell).minBlockSize : "";
      });
    expect(await minimum()).toBe("800px");
    await page.locator("#shell").evaluate((host) => {
      host.setAttribute("embedded", "");
    });
    await frames(page, 2);
    expect(await minimum()).toBe("0px");
  });
});

test.describe("details of the arrangements", () => {
  test("the immersive layout keeps the page gutter at 1280px", async ({ page }) => {
    await openShell(page, { layout: "immersive" });
    const found = await regions(page);
    expect(found.brand.x).toBeGreaterThanOrEqual(32);
  });

  test("the split hero's menu button is no taller than the actions beside it, and centred on them", async ({
    page,
  }) => {
    await openShell(page, { layout: "split-hero" });
    const found = await regions(page);
    const button = await page.locator("#action-last").evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { height: box.height, centre: box.y + box.height / 2 };
    });
    expect(found.toggle.height).toBeLessThanOrEqual(button.height + 4);
    expect(Math.abs(found.toggle.y + found.toggle.height / 2 - button.centre)).toBeLessThanOrEqual(
      1,
    );
  });
});
