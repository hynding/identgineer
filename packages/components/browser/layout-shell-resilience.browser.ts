import type { Page } from "@playwright/test";
import { LAYOUTS, UX_MODES } from "./axes";
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

test.describe("the menu button does not move, in any UX mode or at larger text", () => {
  const CASES: [string, number][] = [
    ["top-bar", 768],
    ["bento", 768],
    ["split-hero", 768],
    ["split-hero", 1024],
  ];
  const opened = async (page: Page) => {
    const toggle = page.locator("#shell").locator('[part="toggle"]');
    await expect(toggle).toBeVisible();
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
  };
  for (const [layout, width] of CASES) {
    for (const ux of UX_MODES) {
      test(`${layout} at ${String(width)}px in the ${ux} UX mode`, async ({ page }) => {
        await openShell(page, { width, layout, ux });
        await opened(page);
      });
    }
    test(`${layout} at ${String(width)}px with the root font at 150%`, async ({ page }) => {
      await openShell(page, { width: width * 1.5, layout, fontSize: "150%" });
      await opened(page);
    });
  }
});
