import type { Page } from "@playwright/test";
import { LAYOUTS, UX_MODES, applyAxes } from "./axes";
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
import { setTextSize, TEXT_SIZES } from "./text-size";

/** What a page puts into the shell that the fixture does not, so the layouts are held to it. */
type Change =
  | "many-items"
  | "long-label"
  | "long-brand"
  | "wide-hero-text"
  | "long-hero-word"
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
    if (what === "long-hero-word") {
      host.querySelector('[slot="hero"] .lede')?.append(` ${"w".repeat(80)}`);
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

  for (const kind of ["wide-hero-text", "long-hero-word"] as const) {
    test(`${kind}: the hero holds its text, with nothing clipped and no sideways scroll, at 320px with the root font at 200%`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openShell(page, { width: 320, fontSize: "200%" });
      await change(page, kind);
      for (const layout of LAYOUTS) {
        await setLayout(page, layout);
        await frames(page, 3);
        const hero = await page.locator("#shell").evaluate((host) => {
          const element = host.shadowRoot?.querySelector<HTMLElement>('[part="hero"]');
          if (!element) throw new Error("no hero");
          const style = getComputedStyle(element);
          return {
            overflow: `${style.overflowX} ${style.overflowY}`,
            wider: element.scrollWidth - element.clientWidth,
          };
        });
        expect(hero.overflow, `${layout} hides or scrolls the hero`).toBe("visible visible");
        expect(hero.wider, `${layout}: the hero's content runs past the hero`).toBeLessThanOrEqual(
          1,
        );
        expect(await sideways(page), layout).toBeLessThanOrEqual(0);
      }
    });
  }

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

  // The layouts that show the navigation as a panel, not a drawer, at each width.
  const PANEL_CASES: [string, number][] = [
    ...(["top-bar", "bento", "split-hero", "magazine", "centered"] as const).map(
      (layout): [string, number] => [layout, 390],
    ),
    ...(["top-bar", "bento", "split-hero"] as const).map((layout): [string, number] => [
      layout,
      768,
    ]),
  ];

  for (const [layout, width] of PANEL_CASES) {
    test(`${layout} at ${String(width)}px: the panel is followed by the actions, never preceded by a jump up`, async ({
      page,
    }) => {
      await openShell(page, { width, layout });
      const toggle = page.locator("#shell").locator('[part="toggle"]');
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect
        .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
        .toBe(true);
      await frames(page, 3);
      const modal = await page
        .locator("#shell")
        .evaluate((host) => host.shadowRoot?.querySelector("dialog")?.matches(":modal"));
      expect(modal, "a panel is not modal").toBe(false);
      const stops = await tabStops(page);
      const ranks = stops.map((stop) => RANK.indexOf(stop.region));
      expect(ranks.includes(RANK.indexOf("navigation")), "the navigation is reached").toBe(true);
      expect(ranks, "regions in the order of the markup").toEqual([...ranks].sort((a, b) => a - b));
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

test.describe("a long navigation scrolling along the top bar", () => {
  test("every item Tab reaches lies inside the bar's navigation", async ({ page }) => {
    await openShell(page, { width: 1280, layout: "top-bar" });
    await change(page, "many-items");
    const stops = await tabStops(page, 40);
    const items = stops.filter((stop) => stop.region === "navigation");
    expect(items.length).toBeGreaterThanOrEqual(26);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      (document.activeElement as HTMLElement | null)?.blur();
    });
    for (let index = 0; index < items.length + 4; index += 1) {
      await page.keyboard.press("Tab");
      await frames(page, 1);
      const outside = await page.evaluate(() => {
        const host = document.getElementById("shell");
        const navigation = host?.shadowRoot?.querySelector<HTMLElement>('[part="navigation"]');
        const active = document.activeElement;
        if (!navigation || active?.getAttribute("slot") !== "navigation") return 0;
        const box = active.getBoundingClientRect();
        const bar = navigation.getBoundingClientRect();
        return Math.max(bar.left - box.left, box.right - bar.right, 0);
      });
      expect(
        outside,
        `step ${String(index)}: the focused item is cut by the bar`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("the menu button stays under the pointer while the panel opens", () => {
  const CASES: [string, number][] = [
    ["top-bar", 768],
    ["top-bar", 1024],
    ["bento", 768],
    ["bento", 1024],
    ["split-hero", 768],
    ["split-hero", 1024],
    ["split-hero", 1280],
  ];
  for (const [layout, width] of CASES) {
    test(`${layout} at ${String(width)}px`, async ({ page }) => {
      await openShell(page, { width, layout });
      const toggle = page.locator("#shell").locator('[part="toggle"]');
      await expect(toggle).toBeVisible();
      const before = await toggle.boundingBox();
      await toggle.click();
      await expect
        .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
        .toBe(true);
      await frames(page, 3);
      const after = await toggle.boundingBox();
      expect(before).not.toBeNull();
      // Within half a pixel: the rows of the header settle on fractions of one.
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(after?.[key], key).toBeCloseTo(before?.[key] ?? Number.NaN, 0);
      }
    });
  }
});

test.describe("a long brand in a rail", () => {
  for (const layout of ["side-rail", "dashboard"]) {
    for (const fontSize of ["100%", "200%"]) {
      test(`${layout} at ${fontSize} text: the brand is whole and the rail still scrolls its navigation`, async ({
        page,
      }) => {
        await openShell(page, { width: 1600, height: 600, layout, fontSize });
        await change(page, "long-brand");
        await change(page, "many-items");
        await frames(page, 3);
        const brand = await page.locator("#shell").evaluate((host) => {
          const element = host.shadowRoot?.querySelector<HTMLElement>('[part="brand"]');
          const navigation = host.shadowRoot?.querySelector<HTMLElement>('[part="navigation"]');
          if (!element || !navigation) throw new Error("missing");
          return {
            tall: element.scrollHeight - element.clientHeight,
            wide: element.scrollWidth - element.clientWidth,
            gap: navigation.getBoundingClientRect().top - element.getBoundingClientRect().bottom,
          };
        });
        expect(brand.tall, "brand clipped above or below").toBeLessThanOrEqual(1);
        expect(brand.wide, "brand clipped at the side").toBeLessThanOrEqual(1);
        expect(brand.gap, "the navigation starts under the brand").toBeGreaterThanOrEqual(-1);
        for (const id of ["nav-first", "item-19", "nav-first"]) {
          await page.locator(`#${id}`).focus();
          await frames(page, 1);
          const covered = await page.locator("#shell").evaluate((host, target) => {
            const element = host.shadowRoot?.querySelector<HTMLElement>('[part="brand"]');
            const item = document.getElementById(target);
            if (!element || !item) throw new Error("missing");
            return element.getBoundingClientRect().bottom - item.getBoundingClientRect().top;
          }, id);
          expect(covered, `${id} under the brand`).toBeLessThanOrEqual(1);
        }
      });
    }
  }
});

test.describe("an embedded shell takes the height its content needs", () => {
  for (const layout of LAYOUTS) {
    test(layout, async ({ page }) => {
      await openShell(page, { width: 1280, height: 1400, layout });
      await page.locator("#shell").evaluate((host) => {
        host.setAttribute("embedded", "");
        host.querySelectorAll(":scope > :not([slot]), [slot=aside], [slot=footer]").forEach((n) => {
          n.remove();
        });
        const text = document.createElement("p");
        text.textContent = "A short page.";
        host.append(text);
      });
      await frames(page, 3);
      const height = await page
        .locator("#shell")
        .evaluate((host) => host.getBoundingClientRect().height);
      expect(height, "the shell is as tall as its content").toBeLessThan(1000);
    });
  }
});

test.describe("an embedded shell keeps the shape of its aside", () => {
  for (const layout of ["top-bar", "magazine", "immersive"]) {
    test(`${layout}: the aside card is as tall as it is when the shell is not embedded`, async ({
      page,
    }) => {
      await openShell(page, { width: 1280, height: 800, layout });
      const asideHeight = () =>
        page.locator("#shell").evaluate((host) => {
          const aside = host.shadowRoot?.querySelector<HTMLElement>('[part="aside"]');
          if (!aside) throw new Error("no aside");
          return aside.getBoundingClientRect().height;
        });
      const before = await asideHeight();
      expect(before, "an aside is drawn").toBeGreaterThan(0);
      await page.locator("#shell").evaluate((host) => {
        host.setAttribute("embedded", "");
      });
      await frames(page, 3);
      expect(await asideHeight()).toBeCloseTo(before, 0);
    });
  }
});

test.describe("scrolling a navigation does not scroll the page", () => {
  for (const direction of ["ltr", "rtl"] as const) {
    test(`${direction}: Tab, click and script focus leave the page where it is`, async ({
      page,
    }) => {
      await openShell(page, { width: 1280, height: 800, layout: "top-bar", direction });
      await change(page, "many-items");
      await page.evaluate(() => {
        document.addEventListener("click", (event) => {
          event.preventDefault();
        });
      });
      await page.evaluate(() => {
        window.scrollTo(0, 1100);
      });
      await frames(page, 2);
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY, "the page is scrolled").toBeGreaterThan(500);
      const inside = () =>
        page.evaluate(() => {
          const host = document.getElementById("shell");
          const navigation = host?.shadowRoot?.querySelector<HTMLElement>('[part="navigation"]');
          const active = document.activeElement;
          if (!navigation || active?.getAttribute("slot") !== "navigation") return Number.NaN;
          const box = active.getBoundingClientRect();
          const bar = navigation.getBoundingClientRect();
          return Math.max(bar.left - box.left, box.right - bar.right, 0);
        });
      await page.locator("#nav-first").focus();
      for (let index = 0; index < 18; index += 1) {
        await page.keyboard.press("Tab");
        await frames(page, 1);
        expect(await page.evaluate(() => window.scrollY), `Tab ${String(index)}`).toBe(scrollY);
        expect(await inside(), `Tab ${String(index)} cuts the item`).toBeLessThanOrEqual(1);
      }
      for (let index = 0; index < 18; index += 1) {
        await page.keyboard.press("Shift+Tab");
        await frames(page, 1);
        expect(await page.evaluate(() => window.scrollY), `Shift+Tab ${String(index)}`).toBe(
          scrollY,
        );
        expect(await inside(), `Shift+Tab ${String(index)} cuts the item`).toBeLessThanOrEqual(1);
      }
      await page.locator("#item-15").click();
      expect(await page.evaluate(() => window.scrollY), "click").toBe(scrollY);
      expect(await inside(), "click cuts the item").toBeLessThanOrEqual(1);
      await page.locator("#item-2").focus();
      expect(await page.evaluate(() => window.scrollY), "script focus").toBe(scrollY);
      expect(await inside(), "script focus cuts the item").toBeLessThanOrEqual(1);
    });
  }
});

test.describe("a split hero taller than the window", () => {
  const inView = (page: Page) =>
    page.locator("#hero-link").evaluate((link) => {
      const box = link.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: window.innerHeight };
    });

  const CASES: [string, { width: number; height: number; fontSize?: string }, boolean][] = [
    ["1280x500 at 100%", { width: 1280, height: 500 }, false],
    ["1280x720 at 125% text", { width: 1280, height: 720, fontSize: "125%" }, false],
    ["1280x800 with more in the hero", { width: 1280, height: 800 }, true],
  ];

  for (const [name, size, extra] of CASES) {
    test(`${name}: a focused hero link is wholly in the window`, async ({ page }) => {
      await openShell(page, { ...size, layout: "split-hero" });
      if (extra) {
        await page.evaluate(() => {
          const lede = document.querySelector("#shell .lede");
          for (let index = 0; index < 8; index += 1) {
            const paragraph = document.createElement("p");
            paragraph.textContent =
              "More about how the page is housed, in a sentence or two. ".repeat(4);
            lede?.after(paragraph);
          }
        });
        await frames(page, 3);
      }
      await page.locator("#hero-link").focus();
      await frames(page, 2);
      const box = await inView(page);
      expect(box.top, "the link is below the top").toBeGreaterThanOrEqual(0);
      expect(box.bottom, "the link is above the bottom").toBeLessThanOrEqual(box.height);
    });
  }

  test("1280x800: a hero that fits stays in view while the content scrolls", async ({ page }) => {
    await openShell(page, { width: 1280, height: 800, layout: "split-hero" });
    await page.evaluate(() => {
      window.scrollTo(0, 700);
    });
    await frames(page, 2);
    const top = await page
      .locator("#shell")
      .evaluate(
        (host) => host.shadowRoot?.querySelector('[part="hero"]')?.getBoundingClientRect().top,
      );
    expect(top).toBe(0);
  });
});

test.describe("the menu button does not move, in any UX mode, at larger text or in RTL", () => {
  const CASES: [string, number][] = [
    ["top-bar", 768],
    ["bento", 768],
    ["split-hero", 768],
    ["top-bar", 1024],
    ["bento", 1024],
    ["split-hero", 1024],
    ["split-hero", 1280],
  ];

  /** Asserts the closed bar is tidy, opens the panel, and asserts the button has not moved. */
  const opened = async (page: Page, layout: string, width: number) => {
    const toggle = page.locator("#shell").locator('[part="toggle"]');
    await expect(toggle).toBeVisible();
    const closed = await page.locator("#shell").evaluate((host) => {
      const centre = (element: Element | null | undefined) => {
        const box = element?.getBoundingClientRect();
        return box ? box.top + box.height / 2 : Number.NaN;
      };
      const tree = host.shadowRoot;
      const header = tree?.querySelector<HTMLElement>('[part="header"]');
      const button = tree?.querySelector<HTMLElement>('[part="toggle"]');
      if (!header || !button) throw new Error("missing");
      const parts = [
        button,
        document.getElementById("brand-link"),
        tree?.querySelector('[part="actions"]'),
      ]
        .filter((element): element is HTMLElement => element !== null)
        .map((element) => element.getBoundingClientRect());
      const style = getComputedStyle(header);
      const around =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        Number.parseFloat(style.borderTopWidth) +
        Number.parseFloat(style.borderBottomWidth);
      return {
        toggle: centre(button),
        brand: centre(document.getElementById("brand-link")),
        actions: centre(tree?.querySelector('[part="actions"]')),
        actionsHeight: tree?.querySelector('[part="actions"]')?.getBoundingClientRect().height ?? 0,
        toggleHeight: button.getBoundingClientRect().height,
        // Whether the actions share the button's row, in which case they are centred on it.
        sameRow: (() => {
          const holder = tree?.querySelector('[part="actions"]')?.getBoundingClientRect();
          const own = button.getBoundingClientRect();
          return holder !== undefined && holder.top < own.bottom && holder.bottom > own.top;
        })(),
        height: header.getBoundingClientRect().height,
        content:
          Math.max(...parts.map((box) => box.bottom)) - Math.min(...parts.map((box) => box.top)),
        around,
      };
    });
    // Where the actions wrap onto two rows, or sit on a row of their own, the button is aligned with
    // the brand instead.
    const compared = closed.sameRow && closed.actionsHeight <= closed.toggleHeight + 8;
    if (compared) {
      expect(
        Math.abs(closed.toggle - closed.actions),
        "toggle centred on the actions",
      ).toBeLessThanOrEqual(1);
    }
    expect(
      Math.abs(closed.toggle - closed.brand),
      "toggle centred on the brand",
    ).toBeLessThanOrEqual(1);
    if (layout !== "split-hero" || width < 1000) {
      expect(closed.height, "the bar is no taller than what is in it").toBeLessThanOrEqual(
        closed.content + closed.around + 1,
      );
    }
    const before = await toggle.boundingBox();
    await toggle.click();
    await expect
      .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
      .toBe(true);
    await frames(page, 3);
    const after = await toggle.boundingBox();
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(after?.[key], key).toBeCloseTo(before?.[key] ?? Number.NaN, 0);
    }
    return compared;
  };

  // The comparison with the actions only applies where they share the button's row, so each layout
  // must show it ran at least once, or a change of arrangement could leave it checking nothing.
  for (const layout of new Set(CASES.map(([name]) => name))) {
    test(`${layout}: the button is compared with the actions beside it in at least one case`, async ({
      page,
    }) => {
      let ran = 0;
      for (const [name, width] of CASES) {
        if (name !== layout) continue;
        await openShell(page, { width, layout });
        if (await opened(page, layout, width)) ran += 1;
      }
      expect(ran, `${layout}: cases that compared the button with its actions`).toBeGreaterThan(0);
    });
  }

  for (const [layout, width] of CASES) {
    for (const ux of UX_MODES) {
      test(`${layout} at ${String(width)}px in the ${ux} UX mode`, async ({ page }) => {
        await openShell(page, { width, layout, ux });
        await opened(page, layout, width);
      });
    }
    test(`${layout} at ${String(width)}px with the root font at 150%`, async ({ page }) => {
      await openShell(page, { width: width * 1.5, layout, fontSize: "150%" });
      await opened(page, layout, width);
    });
    test(`${layout} at ${String(width)}px in a right-to-left page`, async ({ page }) => {
      await openShell(page, { width, layout, direction: "rtl" });
      await opened(page, layout, width);
    });
  }
});

test.describe("a window that shrinks and grows a pixel at a time", () => {
  test("the split hero is pinned whole while it fits, by its end once it does not, and a focused hero link is in the window", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openShell(page, { width: 1280, height: 900, layout: "split-hero" });
    /** Where the hero is in the window after the page is scrolled down by `by`. */
    const heroAfterScrolling = async (by: number) => {
      await page.evaluate((y) => {
        window.scrollTo(0, y);
      }, by);
      await frames(page, 2);
      return page.locator("#shell").evaluate((host) => {
        const hero = host.shadowRoot?.querySelector<HTMLElement>('[part="hero"]');
        const box = hero?.getBoundingClientRect();
        return {
          position: hero ? getComputedStyle(hero).position : "",
          top: box?.top ?? Number.NaN,
          bottom: box?.bottom ?? Number.NaN,
          height: box?.height ?? Number.NaN,
          window: window.innerHeight,
        };
      });
    };
    const fits = await heroAfterScrolling(700);
    expect(fits.position).toBe("sticky");
    expect(fits.top).toBe(0);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    for (let height = 900; height >= 360; height -= 1) {
      await page.setViewportSize({ width: 1280, height });
      await frames(page, 1);
    }
    await frames(page, 3);
    const tall = await heroAfterScrolling(2000);
    expect(tall.height, "the hero is taller than the window").toBeGreaterThan(tall.window);
    expect(tall.position).toBe("sticky");
    expect(tall.bottom, "the hero's end is in the window").toBeLessThanOrEqual(tall.window);
    expect(tall.bottom, "and held at its end").toBeGreaterThanOrEqual(tall.window - 1);
    const start = await heroAfterScrolling(0);
    expect(start.top, "the hero's start is at the top of the page").toBe(0);
    await page.evaluate(() => {
      window.scrollTo(0, 800);
    });
    await page.locator("#hero-link").focus();
    await frames(page, 2);
    const box = await page.locator("#hero-link").evaluate((link) => {
      const rect = link.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, window: window.innerHeight };
    });
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.window);
    for (let height = 360; height <= 900; height += 1) {
      await page.setViewportSize({ width: 1280, height });
      await frames(page, 1);
    }
    await frames(page, 3);
    const fitsAgain = await heroAfterScrolling(700);
    expect(fitsAgain.top).toBe(0);
  });
});

test.describe("scroll padding and the bar's own controls", () => {
  const padding = (page: Page) =>
    page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
    );

  for (const layout of ["top-bar", "dashboard"]) {
    test(`${layout}: Tab through the brand, navigation and actions leaves a scrolled page where it is`, async ({
      page,
    }) => {
      await openShell(page, { width: 1280, height: 700, layout });
      await page.evaluate(() => {
        window.scrollTo(0, 900);
      });
      await frames(page, 2);
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(500);
      await page.locator("#brand-link").focus();
      expect(await page.evaluate(() => window.scrollY), "brand").toBe(scrollY);
      for (let index = 0; index < 10; index += 1) {
        await page.keyboard.press("Tab");
        await frames(page, 1);
        const info = await focusInfo(page);
        if (!["brand", "navigation", "actions", "toggle"].includes(info.region)) break;
        expect(await page.evaluate(() => window.scrollY), `${info.region}#${info.id}`).toBe(
          scrollY,
        );
      }
    });

    test(`${layout}: a script that scrolls a target to the top lands it under the bar, not behind it`, async ({
      page,
    }) => {
      await openShell(page, { width: 1280, height: 700, layout });
      await page.evaluate(() => {
        document.addEventListener("click", (event) => {
          const link = event
            .composedPath()
            .find(
              (node): node is HTMLAnchorElement =>
                node instanceof HTMLAnchorElement && node.hash.length > 1,
            );
          if (!link) return;
          event.preventDefault();
          document.querySelector(link.hash)?.scrollIntoView({ block: "start" });
        });
      });
      await page.locator('a[slot="navigation"][href="#components"]').click();
      await frames(page, 3);
      const top = await page.evaluate(
        () => document.getElementById("components")?.getBoundingClientRect().top ?? Number.NaN,
      );
      const inset = await padding(page);
      expect(inset, "the page pads its scroll by the bar").toBeGreaterThan(0);
      expect(top, "the target is not under the bar").toBeGreaterThanOrEqual(inset - 1);
    });

    test(`${layout}: focusing the content still keeps it clear of the bar`, async ({ page }) => {
      await openShell(page, { width: 1280, height: 700, layout });
      await page.evaluate(() => {
        const link = document.getElementById("main-link");
        if (link) window.scrollTo(0, window.scrollY + link.getBoundingClientRect().top - 10);
      });
      await page.locator("#main-link").focus();
      await frames(page, 2);
      const top = await page.evaluate(
        () => document.getElementById("main-link")?.getBoundingClientRect().top ?? Number.NaN,
      );
      expect(top).toBeGreaterThanOrEqual((await padding(page)) - 1);
    });
  }
});

test.describe("a text field in the pinned bar", () => {
  const FIELDS = {
    "idg-input": "idg-input",
    "idg-textarea": "idg-textarea",
    "native input": "input",
  };
  for (const layout of ["top-bar", "dashboard"]) {
    for (const [kind, tag] of Object.entries(FIELDS)) {
      test(`${layout}, ${kind}: focus, Tab, click and typing leave a scrolled page where it is`, async ({
        page,
      }) => {
        await openShell(page, { width: 1280, height: 700, layout });
        await page.evaluate((name) => {
          const field = document.createElement(name);
          field.id = "bar-field";
          field.slot = "actions";
          field.setAttribute(name === "input" ? "aria-label" : "label", "Search");
          document.getElementById("shell")?.append(field);
        }, tag);
        await expect(page.locator("#bar-field:not(.hydrated)")).toHaveCount(
          kind === "native input" ? 1 : 0,
        );
        await frames(page, 3);
        await page.evaluate(() => {
          window.scrollTo(0, 900);
        });
        await frames(page, 2);
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY).toBeGreaterThan(500);
        const field = page.locator("#bar-field");
        await field.focus();
        await frames(page, 2);
        expect(await page.evaluate(() => window.scrollY), "focus()").toBe(scrollY);
        await page.locator("#brand-link").focus();
        for (let step = 0; step < 12; step += 1) {
          await page.keyboard.press("Tab");
          await frames(page, 1);
          expect(await page.evaluate(() => window.scrollY), `Tab ${String(step)}`).toBe(scrollY);
          if (await page.evaluate(() => document.activeElement?.id === "bar-field")) break;
        }
        expect(await page.evaluate(() => document.activeElement?.id)).toBe("bar-field");
        await page.locator("#main-link").focus();
        await page.evaluate((y) => {
          window.scrollTo(0, y);
        }, scrollY);
        await field.click();
        await frames(page, 2);
        expect(await page.evaluate(() => window.scrollY), "click").toBe(scrollY);
        await page.keyboard.type("hello");
        await frames(page, 2);
        expect(await page.evaluate(() => window.scrollY), "typing").toBe(scrollY);
      });
    }
  }
});

test.describe("a long navigation in a modal drawer", () => {
  for (const layout of ["dashboard", "side-rail", "immersive"]) {
    test(`${layout}: Tab forward and Shift+Tab back keep every focused item inside the drawer`, async ({
      page,
    }) => {
      await openShell(page, { width: 600, height: 400, layout });
      await page.evaluate(() => {
        const host = document.getElementById("shell");
        for (let index = 0; index < 30; index += 1) {
          const link = document.createElement("a");
          link.slot = "navigation";
          link.href = `#drawer-${String(index)}`;
          link.textContent = `Drawer item ${String(index)}`;
          host?.append(link);
        }
      });
      await frames(page, 3);
      await page.locator("#shell").locator('[part="toggle"]').click();
      await expect
        .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
        .toBe(true);
      await frames(page, 3);
      const outside = () =>
        page.locator("#shell").evaluate((host) => {
          const box = host.shadowRoot?.querySelector('[part="drawer"]')?.getBoundingClientRect();
          const active = document.activeElement?.getBoundingClientRect();
          if (!box || !active || document.activeElement?.slot !== "navigation") return 0;
          return Math.max(box.top - active.top, active.bottom - box.bottom, 0);
        });
      for (let index = 0; index < 34; index += 1) {
        await page.keyboard.press("Tab");
        await frames(page, 1);
        expect(await outside(), `forward ${String(index)}`).toBeLessThanOrEqual(1);
      }
      for (let index = 0; index < 34; index += 1) {
        await page.keyboard.press("Shift+Tab");
        await frames(page, 1);
        expect(await outside(), `back ${String(index)}`).toBeLessThanOrEqual(1);
      }
    });
  }
});

test.describe("the held bar row yields to a larger bar", () => {
  const toggleState = (page: Page) =>
    page.locator("#shell").evaluate((host) => {
      const tree = host.shadowRoot;
      const button = tree?.querySelector<HTMLElement>('[part="toggle"]')?.getBoundingClientRect();
      const header = tree?.querySelector<HTMLElement>('[part="header"]');
      const drawer = tree?.querySelector<HTMLElement>('[part="drawer"]')?.getBoundingClientRect();
      if (!button || !header || !drawer) throw new Error("missing");
      const rows = getComputedStyle(header).gridTemplateRows.split(" ");
      const top =
        header.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(header).paddingTop);
      return {
        button,
        firstRow: Number.parseFloat(rows[0] ?? "0"),
        top,
        drawerTop: drawer.top,
        overlap: Math.min(button.bottom, drawer.bottom) - Math.max(button.top, drawer.top),
      };
    });

  for (const change of ["ux", "font"] as const) {
    test(`top-bar at 768px: after ${change === "ux" ? "a switch to the focus UX mode" : "a 150% root font"} the open toggle stays in the first row, clear of the panel, and clicks`, async ({
      page,
    }) => {
      await openShell(page, { width: 768, layout: "top-bar" });
      const toggle = page.locator("#shell").locator('[part="toggle"]');
      const before = await toggle.boundingBox();
      await toggle.click();
      await expect
        .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
        .toBe(true);
      await frames(page, 3);
      const opened = await toggle.boundingBox();
      expect(opened?.y).toBeCloseTo(before?.y ?? Number.NaN, 0);
      await page.evaluate((what) => {
        if (what === "ux") document.documentElement.setAttribute("data-ux", "focus");
        else document.documentElement.style.fontSize = "150%";
      }, change);
      await frames(page, 4);
      const state = await toggleState(page);
      expect(state.button.bottom, "inside the first row").toBeLessThanOrEqual(
        state.top + state.firstRow + 1,
      );
      expect(state.overlap, "clear of the panel").toBeLessThanOrEqual(1);
      const box = await toggle.boundingBox();
      if (!box) throw new Error("no box");
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 1);
      await expect
        .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
        .toBe(false);
    });
  }
});

test.describe("the brand stays on one line wherever it has room", () => {
  const WIDTHS_FOR_BRAND = [640, 700, 768, 900, 1024, 1152, 1280, 1920] as const;
  for (const layout of LAYOUTS) {
    test(`${layout}: the fixture's brand is one line at every width, UX mode and text size, with no sideways scroll or overlap`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await openShell(page, { width: 1280, layout });
      for (const size of TEXT_SIZES) {
        await setTextSize(page, size);
        for (const ux of UX_MODES) {
          await page.evaluate((mode) => {
            document.documentElement.setAttribute("data-ux", mode);
          }, ux);
          for (const width of WIDTHS_FOR_BRAND) {
            await page.setViewportSize({ width, height: 800 });
            await frames(page, 2);
            const where = `${layout} at ${String(width)}px, ${ux}, ${size.label}`;
            const lines = await page.evaluate(() => {
              const name = document.querySelector("#brand-link span");
              if (!name) throw new Error("no brand");
              const range = document.createRange();
              range.selectNodeContents(name);
              const tops = new Set(
                [...range.getClientRects()]
                  .filter((box) => box.width > 0)
                  .map((box) => Math.round(box.top)),
              );
              return tops.size;
            });
            expect(lines, `${where}: brand lines`).toBe(1);
            expect(await sideways(page), `${where}: sideways scroll`).toBeLessThanOrEqual(1);
            expect(collisions(layout, await regions(page)), `${where}: overlaps`).toEqual([]);
          }
        }
      }
    });
  }
});

test.describe("nothing in the chrome covers or crowds anything else in it", () => {
  const WIDTHS_FOR_CHROME = [640, 768, 900, 1024, 1152, 1280, 1920] as const;

  /** What is wrong with the chrome now, as one line each, read in the page. */
  const problems = (page: Page): Promise<string[]> =>
    page.locator("#shell").evaluate((host) => {
      const found: string[] = [];
      const deepAt = (x: number, y: number): Element | null => {
        let hit = document.elementFromPoint(x, y);
        while (hit?.shadowRoot) {
          const inner = hit.shadowRoot.elementFromPoint(x, y);
          if (!inner || inner === hit) break;
          hit = inner;
        }
        return hit;
      };
      const within = (hit: Element | null, target: Element): boolean => {
        for (let node: Node | null = hit; node;) {
          if (node === target) return true;
          node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
        }
        return false;
      };
      const shown = (element: Element): boolean => {
        const box = element.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          (element as HTMLElement).checkVisibility({ visibilityProperty: true }) &&
          box.top >= 0 &&
          box.bottom <= window.innerHeight
        );
      };
      const tree = host.shadowRoot;
      const navigation = tree?.querySelector<HTMLElement>('[part="navigation"]');
      const toggle = tree?.querySelector<HTMLElement>('[part="toggle"]');
      const brandLink = document.getElementById("brand-link");
      const navLinks = [...host.querySelectorAll('[slot="navigation"]')];
      const actions = [...host.querySelectorAll('[slot="actions"]')];
      const room = navigation?.getBoundingClientRect();
      // A navigation that deliberately scrolls along the bar hides some of its items from the pointer.
      const scrolls = navigation
        ? navigation.scrollWidth > navigation.clientWidth &&
          getComputedStyle(navigation).overflowInline !== "visible"
        : false;
      const reachable = (link: Element): boolean => {
        if (!scrolls || !room) return true;
        const box = link.getBoundingClientRect();
        return box.left >= room.left - 1 && box.right <= room.right + 1;
      };
      const targets: [string, Element | null | undefined][] = [
        ["menu button", toggle],
        ["brand", brandLink],
        ...navLinks.map((link): [string, Element] => [`navigation ${link.id}`, link]),
        ...actions.map((action): [string, Element] => [`action ${action.id}`, action]),
      ];
      for (const [name, element] of targets) {
        if (element && !reachable(element)) continue;
        if (!element || !shown(element)) continue;
        const box = element.getBoundingClientRect();
        const hit = deepAt(box.left + box.width / 2, box.top + box.height / 2);
        if (!within(hit, element)) found.push(`${name} is covered by ${hit?.tagName ?? "nothing"}`);
      }
      if (navigation && room && !scrolls) {
        for (const link of navLinks) {
          if (!shown(link)) continue;
          const box = link.getBoundingClientRect();
          if (box.left < room.left - 1 || box.right > room.right + 1) {
            found.push(`navigation ${link.id} leaves the navigation`);
          }
        }
      }
      if (brandLink) {
        const range = document.createRange();
        range.selectNodeContents(brandLink);
        const texts = [...range.getClientRects()].filter((box) => box.width > 0);
        const others: [string, Element | null | undefined][] = [
          ["menu button", toggle],
          ...actions.map((action): [string, Element] => [`action ${action.id}`, action]),
        ];
        for (const [name, other] of others) {
          if (!other || !shown(other)) continue;
          const box = other.getBoundingClientRect();
          const crowded = texts.some(
            (text) =>
              Math.min(text.right, box.right) - Math.max(text.left, box.left) > 1 &&
              Math.min(text.bottom, box.bottom) - Math.max(text.top, box.top) > 1,
          );
          if (crowded) found.push(`the brand text runs under the ${name}`);
        }
      }
      const actionsPart = tree?.querySelector<HTMLElement>('[part="actions"]');
      const header = tree?.querySelector<HTMLElement>('[part="header"]');
      const bar = header?.getBoundingClientRect();
      const barStyle = header ? getComputedStyle(header) : undefined;
      const content =
        bar && barStyle && bar.width > 0
          ? {
              left: bar.left + Number.parseFloat(barStyle.paddingLeft),
              right: bar.right - Number.parseFloat(barStyle.paddingRight),
            }
          : undefined;
      const holder = actionsPart?.getBoundingClientRect();
      for (const action of actions) {
        if (!shown(action)) continue;
        const box = action.getBoundingClientRect();
        if (holder && (box.left < holder.left - 1 || box.right > holder.right + 1)) {
          found.push(`action ${action.id} leaves the actions`);
        }
        if (content && (box.left < content.left - 1 || box.right > content.right + 1)) {
          found.push(`action ${action.id} leaves the bar's content`);
        }
      }
      const reach = Math.max(
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        document.body.scrollWidth - document.documentElement.clientWidth,
      );
      if (reach > 1) found.push(`the page scrolls sideways by ${String(reach)}px`);
      return found;
    });

  for (const layout of LAYOUTS) {
    test(`${layout}: with the fixture brand and a long one, every control can be hit and nothing is crowded`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openShell(page, { width: 1280, layout });
      for (const brand of ["the fixture brand", "a long brand"]) {
        if (brand === "a long brand") await change(page, "long-brand");
        for (const size of TEXT_SIZES) {
          await setTextSize(page, size);
          for (const ux of UX_MODES) {
            await page.evaluate((mode) => {
              document.documentElement.setAttribute("data-ux", mode);
            }, ux);
            for (const width of WIDTHS_FOR_CHROME) {
              await page.setViewportSize({ width, height: 900 });
              await frames(page, 2);
              expect(
                await problems(page),
                `${layout} at ${String(width)}px, ${ux}, ${size.label}, ${brand}`,
              ).toEqual([]);
            }
          }
        }
      }
    });
  }
});

test.describe("the arrangement follows the width however the page has read the styles", () => {
  /** Reads what a scan or a tool reads: the computed style of slotted items and of the parts. */
  const readStyles = (page: Page) =>
    page.locator("#shell").evaluate((host) => {
      const read: string[] = [];
      for (const id of ["nav-first", "nav-last", "brand-link", "action-last"]) {
        const element = document.getElementById(id);
        if (element) read.push(getComputedStyle(element).color);
      }
      for (const part of host.shadowRoot?.querySelectorAll("[part]") ?? []) {
        read.push(getComputedStyle(part).flexDirection);
      }
      return read.length;
    });

  /** The navigation items' boxes, and whether the last can be reached by the pointer. */
  const navigationState = (page: Page) =>
    page.evaluate(() => {
      const first = document.getElementById("nav-first")?.getBoundingClientRect();
      const lastElement = document.getElementById("nav-last");
      const last = lastElement?.getBoundingClientRect();
      if (!first || !last || !lastElement) throw new Error("missing");
      const hit = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2);
      return {
        firstTop: first.top,
        lastTop: last.top,
        sameRow:
          Math.abs(first.top + first.height / 2 - (last.top + last.height / 2)) < first.height / 2,
        hittable: hit === lastElement,
      };
    });

  const SOURCES = ["top-bar", "magazine"] as const;
  for (const layout of LAYOUTS) {
    for (const source of SOURCES) {
      test(`${layout}: after styles were read in ${source} at 600px, switching and widening arranges it as a fresh page does`, async ({
        page,
        context,
      }) => {
        await openShell(page, { width: 600, layout: source });
        await readStyles(page);
        await setLayout(page, layout);
        await page.setViewportSize({ width: 1400, height: 900 });
        await frames(page, 3);
        const fresh = await context.newPage();
        await openShell(fresh, { width: 1400, height: 900, layout });
        const round = (found: Regions) =>
          Object.fromEntries(
            Object.entries(found).map(([name, box]) => [
              name,
              [box.x, box.y, box.width, box.height].map((value) => Math.round(value)),
            ]),
          );
        expect(round(await regions(page))).toEqual(round(await regions(fresh)));
        await fresh.close();
      });
    }
  }

  for (const layout of ["top-bar", "bento", "magazine", "centered"]) {
    test(`${layout}: styles read at 600px do not keep the inline navigation a column at 1400px`, async ({
      page,
    }) => {
      await openShell(page, { width: 600, layout });
      await readStyles(page);
      await page.setViewportSize({ width: 1400, height: 900 });
      await frames(page, 3);
      const state = await navigationState(page);
      expect(state.sameRow, "the navigation items share a row").toBe(true);
      expect(state.hittable, "the last item can be hit").toBe(true);
    });

    test(`${layout}: styles read at 1400px do not keep the navigation inline at 600px`, async ({
      page,
    }) => {
      await openShell(page, { width: 1400, layout });
      await readStyles(page);
      await page.setViewportSize({ width: 600, height: 900 });
      await frames(page, 3);
      const toggle = page.locator("#shell").locator('[part="toggle"]');
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect
        .poll(() => page.locator("#shell").evaluate((host) => host.hasAttribute("navigation-open")))
        .toBe(true);
      await frames(page, 3);
      const state = await navigationState(page);
      expect(state.lastTop, "the items stack").toBeGreaterThan(state.firstTop + 10);
    });
  }
});

test.describe("the brand is the measure of what the page puts in it beside the menu button", () => {
  // A brand that must not break (a name of one word) can only fit by sizing itself to the room the
  // bar leaves it, and that room is what a container query unit in the brand measures wherever the
  // bar is a grid that places the brand beside the menu button or on a row of its own: a slotted
  // element 100cqi wide is as wide as the brand. A bar that wraps (immersive) puts the menu button
  // on the next line instead, where the brand is wider than the room left. Either way what the page
  // puts in the brand stays in it.
  for (const layout of LAYOUTS) {
    test(`${layout}: 100cqi in the brand is the brand's own width, which stays clear of the menu button, in every UX mode`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openShell(page, { width: 320, layout });
      await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.id = "brand-probe";
        // Out of the brand's flow, so that nothing in the brand narrows it.
        probe.style.position = "absolute";
        probe.style.inlineSize = "100cqi";
        probe.style.blockSize = "1px";
        document.getElementById("brand-link")?.append(probe);
      });
      const failures: string[] = [];
      for (const ux of UX_MODES) {
        await applyAxes(page, { ux });
        for (const width of [320, 390, 600, 820]) {
          await page.setViewportSize({ width, height: 800 });
          await frames(page, 2);
          const found = await page.locator("#shell").evaluate((host) => {
            const brand = host.shadowRoot?.querySelector<HTMLElement>('[part="brand"]');
            const toggle = host.shadowRoot?.querySelector<HTMLElement>('[part="toggle"]');
            const probe = document.getElementById("brand-probe");
            const link = document.getElementById("brand-link");
            const header = host.shadowRoot?.querySelector<HTMLElement>('[part="header"]');
            if (!brand || !toggle || !probe || !link || !header) throw new Error("missing");
            if (!toggle.checkVisibility()) return undefined;
            const room = brand.getBoundingClientRect();
            const button = toggle.getBoundingClientRect();
            const across = Math.min(room.right, button.right) - Math.max(room.left, button.left);
            const down = Math.min(room.bottom, button.bottom) - Math.max(room.top, button.top);
            const content = link.getBoundingClientRect();
            return {
              grid: getComputedStyle(header).display === "grid",
              probe: probe.getBoundingClientRect().width,
              brand: brand.clientWidth,
              spill: Math.max(content.right - room.right, room.left - content.left),
              overlap: across > 0.5 && down > 0.5,
            };
          });
          if (!found) continue;
          const where = `${ux} at ${String(width)}px`;
          if (found.grid && Math.abs(found.probe - found.brand) > 0.5) {
            failures.push(
              `${where}: 100cqi is ${String(found.probe)}px, the brand ${String(found.brand)}px`,
            );
          }
          if (found.overlap) failures.push(`${where}: the brand runs under the menu button`);
          if (found.spill > 1) {
            failures.push(`${where}: the brand's content leaves it by ${String(found.spill)}px`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

test.describe("without a script", () => {
  // A browser that runs no script cannot be asked for here, so the rule for one is made to apply:
  // the shell's own `@media (scripting: none)` rule is given a media list that always matches.
  test("the navigation is in the bar, with no menu button, in every layout and at every width", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openShell(page);
    const found = await page.locator("#shell").evaluate((host) => {
      let rules = 0;
      for (const sheet of host.shadowRoot?.adoptedStyleSheets ?? []) {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSMediaRule && rule.conditionText === "(scripting: none)") {
            rule.media.mediaText = "all";
            rules += 1;
          }
        }
      }
      return rules;
    });
    expect(found, "the shell's rule for a browser without a script").toBe(1);
    const failures: string[] = [];
    for (const layout of LAYOUTS) {
      await setLayout(page, layout);
      for (const width of [320, 390, 820, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await frames(page, 2);
        const state = await page.locator("#shell").evaluate((host) => {
          const toggle = host.shadowRoot?.querySelector<HTMLElement>('[part="toggle"]');
          const links = [...host.querySelectorAll<HTMLElement>('[slot="navigation"]')];
          return {
            toggle: toggle?.checkVisibility() ?? false,
            hidden: links
              .filter((link) => !link.checkVisibility())
              .map((link) => link.id || link.textContent),
          };
        });
        const where = `${layout} at ${String(width)}px`;
        if (state.toggle) failures.push(`${where}: the menu button is drawn`);
        if (state.hidden.length > 0) failures.push(`${where}: ${state.hidden.join(", ")} hidden`);
      }
    }
    expect(failures).toEqual([]);
  });
});
