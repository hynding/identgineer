import type { Page } from "@playwright/test";
import { accessibleDescendants } from "./accessible-node";
import { expectNoAxeViolations } from "./accessibility";
import { LAYOUTS, UX_MODES, applyAxes, settle } from "./axes";
import { expect, test } from "./fixtures";
import {
  boxOfSlotted,
  partStyle,
  partTop,
  focusInfo,
  frames,
  openShell,
  regions,
  setLayout,
  setShellWidth,
  tabStops,
  type Rect,
} from "./layout-shell-page";

const WIDTHS = [320, 768, 1280, 2560] as const;

/** Layouts that keep the navigation behind a toggle at a container of 768px, which is the medium arrangement. */
const COLLAPSED_AT_MEDIUM: Record<string, boolean> = {
  "top-bar": true,
  "side-rail": false,
  "split-hero": true,
  magazine: false,
  dashboard: false,
  centered: false,
  bento: true,
  immersive: true,
};

const REM = 16;

/** Reads the viewport width the page has, which is narrower than the window by a scrollbar. */
function clientWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.clientWidth);
}

function expectBeside(first: Rect, second: Rect, label: string): void {
  expect(first.right, `${label}: ends before the other starts`).toBeLessThanOrEqual(second.x + 1);
  const overlap = Math.min(first.bottom, second.bottom) - Math.max(first.y, second.y);
  expect(overlap, `${label}: they share rows`).toBeGreaterThan(0);
}

function expectAbove(first: Rect, second: Rect, label: string): void {
  expect(first.bottom, `${label}: ends before the other starts`).toBeLessThanOrEqual(second.y + 1);
}

async function isNavigationDrawn(page: Page): Promise<boolean> {
  return (await regions(page)).navigation.shown;
}

async function isToggleDrawn(page: Page): Promise<boolean> {
  return (await regions(page)).toggle.shown;
}

/** The pieces of the shell's navigation state that a user can see or feel. */
function drawerState(page: Page) {
  return page.locator("#shell").evaluate((host) => {
    const toggle = host.shadowRoot?.querySelector<HTMLElement>('[part="toggle"]');
    const drawer = host.shadowRoot?.querySelector<HTMLDialogElement>('[part="drawer"]');
    if (!toggle || !drawer) throw new Error("no toggle or drawer");
    return {
      expanded: toggle.getAttribute("aria-expanded"),
      open: drawer.open,
      modal: drawer.matches(":modal"),
      attribute: host.hasAttribute("navigation-open"),
      scrollLocked: getComputedStyle(document.documentElement).overflow === "hidden",
    };
  });
}

async function openNavigation(page: Page): Promise<void> {
  await page.locator("#shell").locator('[part="toggle"]').click();
  await expect.poll(async () => (await drawerState(page)).open).toBe(true);
  await frames(page, 3);
}

test.describe("the shell's markup", () => {
  test("is the same landmarks in the same order, one main, labelled, in every layout", async ({
    page,
  }) => {
    await openShell(page);
    const markup = () =>
      page.locator("#shell").evaluate((host) => {
        const tree = host.shadowRoot;
        if (!tree) throw new Error("no shadow root");
        return {
          landmarks: Array.from(tree.querySelectorAll("header, nav, main, aside, footer")).map(
            (element) => `${element.localName}:${element.getAttribute("aria-label") ?? ""}`,
          ),
          headings: tree.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']").length,
          mains: tree.querySelectorAll("main").length,
          inlineStyles: tree.querySelectorAll("[style]").length,
          order: Array.from(tree.querySelectorAll<HTMLElement>("[part]"))
            .map((element) => element.getAttribute("part"))
            .join(","),
        };
      });
    await applyAxes(page, { layout: "top-bar" });
    const first = await markup();
    expect(first.landmarks).toEqual([
      "header:",
      "nav:Main navigation",
      "main:",
      "aside:Related content",
      "footer:",
    ]);
    expect(first.mains).toBe(1);
    expect(first.headings).toBe(0);
    expect(first.inlineStyles).toBe(0);
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      expect(await markup(), layout).toEqual(first);
    }
  });

  test("exposes banner, navigation, main, complementary and contentinfo, in that order, with no dialog", async ({
    page,
  }) => {
    for (const layout of LAYOUTS) {
      await openShell(page, { layout });
      const tree = await accessibleDescendants(page, "shell");
      const landmarks = tree
        .filter((node) =>
          ["banner", "navigation", "main", "complementary", "contentinfo"].includes(node.role),
        )
        .map((node) => `${node.role}:${node.name}`);
      const navigation = (await isNavigationDrawn(page)) ? ["navigation:Main navigation"] : [];
      expect(landmarks, layout).toEqual([
        "banner:",
        ...navigation,
        "main:",
        "complementary:Related content",
        "contentinfo:",
      ]);
      expect(
        tree.some((node) => node.role === "dialog"),
        `${layout}: a closed drawer is not a dialog`,
      ).toBe(false);
    }
  });

  test("adds no heading of its own, so the page's heading order is the author's in every layout", async ({
    page,
  }) => {
    await openShell(page);
    const headings = () => page.getByRole("heading").allTextContents();
    const authored = await headings();
    expect(authored[0]).toBe("Build the page once, then pick how it is housed");
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      expect(await headings(), layout).toEqual(authored);
    }
  });

  test("has exactly one main landmark on the page", async ({ page }) => {
    await openShell(page);
    await expect(page.getByRole("main")).toHaveCount(1);
  });
});

test.describe("the page never scrolls sideways", () => {
  for (const layout of LAYOUTS) {
    for (const width of WIDTHS) {
      test(`${layout} at ${String(width)}px`, async ({ page }) => {
        await openShell(page, { width, layout });
        const overflow = await page.evaluate(() => ({
          root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          body: document.body.scrollWidth - document.documentElement.clientWidth,
        }));
        expect(Math.max(overflow.root, overflow.body)).toBeLessThanOrEqual(0);
      });
    }

    test(`${layout} at 320px with the root font at 200%`, async ({ page }) => {
      await openShell(page, { width: 320, layout, fontSize: "200%" });
      const overflow = await page.evaluate(() => ({
        root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(Math.max(overflow.root, overflow.body)).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("the eight arrangements", () => {
  test("place the regions differently from one another at 1280px", async ({ page }) => {
    await openShell(page);
    const signatures = new Map<string, string>();
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      await frames(page);
      const found = await regions(page);
      const signature = (["navigation", "hero", "main", "aside", "footer"] as const)
        .map((name) => {
          const box = found[name];
          return `${name}:${box.shown ? [box.x, box.y, box.width].map(Math.round).join(",") : "-"}`;
        })
        .join("|");
      signatures.set(layout, signature);
    }
    expect(new Set(signatures.values()).size, JSON.stringify([...signatures])).toBe(LAYOUTS.length);
  });

  test("top-bar: a sticky bar across the top, the aside beside the main content", async ({
    page,
  }) => {
    await openShell(page, { layout: "top-bar" });
    const found = await regions(page);
    expect(found.navigation.shown).toBe(true);
    expect(found.toggle.shown).toBe(false);
    expectAbove(found.navigation, found.main, "navigation over main");
    expect(found.actions.x, "actions at the end of the bar").toBeGreaterThan(found.navigation.x);
    expectBeside(found.main, found.aside, "aside at the end of main");
    await page.evaluate(() => {
      window.scrollTo(0, 700);
    });
    await expect.poll(() => partTop(page, "header")).toBe(0);
  });

  test("side-rail: a rail for the whole block size, actions in a strip over main, the aside below", async ({
    page,
  }) => {
    await openShell(page, { layout: "side-rail" });
    const found = await regions(page);
    expectBeside(found.navigation, found.main, "rail beside main");
    expect(found.navigation.height, "the rail is as tall as the window").toBeGreaterThanOrEqual(
      800,
    );
    expect(found.navigation.x).toBeLessThanOrEqual(1);
    expectAbove(found.actions, found.main, "actions strip over main");
    expect(found.actions.x).toBeGreaterThanOrEqual(found.main.x - 1);
    expectAbove(found.main, found.aside, "aside below main");
    expectAbove(found.aside, found.footer, "footer below aside");
    expect(found.brand.y, "brand at the top of the rail").toBeLessThan(found.navigation.y + 80);
    await page.evaluate(() => {
      window.scrollTo(0, 700);
    });
    await expect.poll(() => partTop(page, "navigation")).toBe(0);
  });

  test("split-hero: the hero keeps the start half in view while main scrolls beside it", async ({
    page,
  }) => {
    await openShell(page, { layout: "split-hero" });
    const found = await regions(page);
    const width = await clientWidth(page);
    expect(found.hero.shown).toBe(true);
    expect(found.hero.right, "the hero is in the start half").toBeLessThanOrEqual(width / 2 + 1);
    expect(found.main.x, "main starts where the hero ends").toBeGreaterThanOrEqual(
      found.hero.right - 1,
    );
    await page.evaluate(() => {
      window.scrollTo(0, 900);
    });
    await expect.poll(() => partTop(page, "hero")).toBe(0);
    expect(await partTop(page, "main"), "main has scrolled away beside it").toBeLessThan(0);
    expect(await page.evaluate(() => window.scrollY), "the page really scrolled").toBeGreaterThan(
      800,
    );
  });

  test("magazine: a centred masthead, a ruled strip of navigation, a narrow aside column", async ({
    page,
  }) => {
    await openShell(page, { layout: "magazine" });
    const found = await regions(page);
    const brand = await boxOfSlotted(page, "#brand-link");
    const width = await clientWidth(page);
    expect(brand.x + brand.width / 2, "brand centred").toBeCloseTo(width / 2, -1);
    expectAbove(brand, found.navigation, "the strip is under the masthead");
    expectAbove(found.navigation, found.main, "navigation over main");
    expectBeside(found.main, found.aside, "aside beside main");
    expect(found.aside.width, "a narrow column").toBeLessThanOrEqual(15 * REM);
    expect(found.main.width).toBeGreaterThan(found.aside.width * 2);
    const rule = parseFloat(await partStyle(page, "navigation", "border-block-start-width"));
    expect(rule, "the strip is ruled").toBeGreaterThan(0);
  });

  test("dashboard: a slim rail, a strip of actions, the aside as an inspector at the end", async ({
    page,
  }) => {
    await openShell(page, { layout: "dashboard" });
    const found = await regions(page);
    expectBeside(found.navigation, found.main, "rail beside main");
    expectBeside(found.main, found.aside, "inspector beside main");
    expectAbove(found.actions, found.main, "actions strip over main");
    expect(found.navigation.width, "the rail is slim").toBeLessThanOrEqual(12 * REM);
    expect(found.aside.height, "the inspector is as tall as the window").toBeGreaterThanOrEqual(
      790,
    );
    const width = await clientWidth(page);
    expect(found.aside.right, "the inspector is at the end").toBeCloseTo(width, -1);
  });

  test("centered: one narrow column in the middle, brand and navigation above, aside and footer below", async ({
    page,
  }) => {
    await openShell(page, { layout: "centered" });
    const found = await regions(page);
    const width = await clientWidth(page);
    expect(found.main.width).toBeLessThanOrEqual(40 * REM + 1);
    expect(found.main.x + found.main.width / 2, "main centred").toBeCloseTo(width / 2, -1);
    const brand = await boxOfSlotted(page, "#brand-link");
    expect(brand.x + brand.width / 2, "brand centred").toBeCloseTo(width / 2, -1);
    expectAbove(brand, found.navigation, "navigation under the brand");
    expectAbove(found.navigation, found.main, "navigation over main");
    expectAbove(found.main, found.aside, "aside below main");
    expectAbove(found.aside, found.footer, "footer below aside");
    expect(found.aside.width).toBeLessThanOrEqual(40 * REM + 1);
  });

  test("bento: every region is a rounded tile on one grid, a gap apart", async ({ page }) => {
    await openShell(page, { layout: "bento" });
    const found = await regions(page);
    const gap = await page.locator("#shell").evaluate((host) => {
      const probe = document.createElement("div");
      probe.style.inlineSize = "calc(var(--idg-layout-gap) * var(--idg-density-gap-scale))";
      host.append(probe);
      const size = probe.getBoundingClientRect().width;
      probe.remove();
      return size;
    });
    expect(gap).toBeGreaterThan(0);
    for (const name of ["brand", "navigation", "actions", "hero", "main", "aside", "footer"]) {
      const radius = parseFloat(await partStyle(page, name, "border-start-start-radius"));
      expect(radius, `${name} tile is rounded`).toBeGreaterThan(0);
    }
    expect(found.main.y - found.hero.bottom, "hero to main").toBeCloseTo(gap, 0);
    expect(found.aside.x - found.main.right, "main to aside").toBeCloseTo(gap, 0);
    expect(
      found.footer.y - Math.max(found.main.bottom, found.aside.bottom),
      "to footer",
    ).toBeCloseTo(gap, 0);
  });

  test("immersive: a full-bleed hero under the overlaid header, navigation behind a toggle, full-bleed main and footer", async ({
    page,
  }) => {
    await openShell(page, { layout: "immersive" });
    const found = await regions(page);
    const width = await clientWidth(page);
    expect(found.navigation.shown).toBe(false);
    expect(found.toggle.shown).toBe(true);
    expect(found.hero.y).toBeCloseTo(0, 0);
    expect(found.hero.width).toBeCloseTo(width, 0);
    expect(found.hero.height, "the hero fills the window").toBeGreaterThanOrEqual(799);
    expect(found.brand.y, "the header is over the hero").toBeLessThan(found.hero.bottom);
    expect(found.brand.y).toBeLessThan(found.hero.y + 200);
    expect(found.main.width).toBeCloseTo(width, 0);
    expect(found.footer.width).toBeCloseTo(width, 0);
  });
});

test.describe("each layout answers to the width of its container, not of the viewport", () => {
  test("keeps the navigation behind a toggle at 360px, and in the page at 1280px, in a 1280px window", async ({
    page,
  }) => {
    await openShell(page);
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      await setShellWidth(page, "360px");
      await expect.poll(() => isToggleDrawn(page), `${layout} at 360`).toBe(true);
      expect(await isNavigationDrawn(page), `${layout} at 360`).toBe(false);
      await setShellWidth(page, "");
      await expect
        .poll(() => isToggleDrawn(page), `${layout} at 1280`)
        .toBe(layout === "immersive");
    }
  });

  test("keeps the navigation behind a toggle at a medium container only where the layout says", async ({
    page,
  }) => {
    await openShell(page);
    await setShellWidth(page, "768px");
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      await expect
        .poll(() => isToggleDrawn(page), `${layout} at 768`)
        .toBe(COLLAPSED_AT_MEDIUM[layout]);
    }
  });

  test("changes the arrangement between a small, a medium and a large container in every layout", async ({
    page,
  }) => {
    await openShell(page);
    const shape = async () => {
      const found = await regions(page);
      return (["navigation", "hero", "main", "aside", "footer"] as const)
        .map((name) => `${name}:${found[name].shown ? String(Math.round(found[name].x)) : "-"}`)
        .join("|");
    };
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      const seen: string[] = [];
      for (const width of ["360px", "768px", "1280px"]) {
        await setShellWidth(page, width);
        await frames(page);
        seen.push(await shape());
      }
      expect(new Set(seen).size, `${layout}: ${seen.join(" / ")}`).toBe(3);
    }
  });
});

test.describe("keyboard order", () => {
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

  for (const width of [320, 1280]) {
    for (const layout of LAYOUTS) {
      test(`${layout} at ${String(width)}px: Tab follows the reading order and the picture`, async ({
        page,
      }) => {
        await openShell(page, { width, layout });
        const stops = await tabStops(page);
        expect(stops[0]?.region, "the skip link is first").toBe("skip");
        const ranks = stops.map((stop) => RANK.indexOf(stop.region));
        expect(
          ranks.every((rank) => rank >= 0),
          JSON.stringify(stops),
        ).toBe(true);
        expect(ranks, "regions in the order of the markup").toEqual(
          [...ranks].sort((a, b) => a - b),
        );
        const regionsSeen = new Set(stops.map((stop) => stop.region));
        for (const region of ["brand", "actions", "hero", "main", "aside", "footer"]) {
          expect(regionsSeen.has(region), `${region} is reachable`).toBe(true);
        }
        const collapsed = !(await isNavigationDrawn(page));
        expect(regionsSeen.has("navigation"), "navigation links are reachable when drawn").toBe(
          !collapsed,
        );
        expect(regionsSeen.has("toggle"), "the toggle is reachable when it is drawn").toBe(
          collapsed,
        );

        // The picture: no stop is above and before the one it follows. A jump up is only allowed
        // into a column that starts after the previous stop ends.
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

  test("a sticky region never covers the element that has focus, in any layout", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    for (const layout of LAYOUTS) {
      await openShell(page, { width: 1280, layout });
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      for (let index = 0; index < 60; index += 1) {
        await page.keyboard.press("Tab");
        await frames(page, 1);
        const covered = await page.evaluate(() => {
          let active: Element | null = document.activeElement;
          while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          const host = document.getElementById("shell");
          if (!active || !host?.shadowRoot) return [];
          const box = active.getBoundingClientRect();
          const problems: string[] = [];
          for (const part of host.shadowRoot.querySelectorAll<HTMLElement>("[part]")) {
            const style = getComputedStyle(part);
            if (style.position !== "sticky" && style.position !== "fixed") continue;
            if (part.contains(active) || part.getRootNode() !== host.shadowRoot) continue;
            const pinned = part.getBoundingClientRect();
            const overlapsAcross = box.left < pinned.right && box.right > pinned.left;
            const underTop = pinned.top <= 1 && pinned.bottom > box.top + 1 && box.bottom > 0;
            if (overlapsAcross && underTop && box.top < pinned.bottom - 1) {
              problems.push(
                `${part.getAttribute("part") ?? ""} covers ${active.id || active.localName}`,
              );
            }
          }
          return problems;
        });
        expect(covered, layout).toEqual([]);
      }
    }
  });
});

test.describe("the skip link", () => {
  for (const layout of LAYOUTS) {
    for (const width of [320, 1280]) {
      test(`${layout} at ${String(width)}px shows on focus and moves focus to main`, async ({
        page,
      }) => {
        await openShell(page, { width, layout });
        await page.keyboard.press("Tab");
        expect(await focusInfo(page)).toMatchObject({ region: "skip" });
        const box = await page.locator("#shell").evaluate((host) => {
          const rect = host.shadowRoot?.querySelector('[part="skip"]')?.getBoundingClientRect();
          return rect
            ? { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom }
            : null;
        });
        expect(box).not.toBeNull();
        expect(box?.right ?? 0).toBeGreaterThan((box?.left ?? 0) + 40);
        expect(box?.top).toBeGreaterThanOrEqual(0);
        expect(box?.left).toBeGreaterThanOrEqual(0);
        expect(box?.bottom).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
        await page.keyboard.press("Enter");
        expect(await focusInfo(page)).toEqual({ region: "main", id: "main" });
        // The next Tab goes into the content, not back to the header.
        await page.keyboard.press("Tab");
        expect((await focusInfo(page)).region).toBe("main");
      });
    }
  }

  test("is named by a prop", async ({ page }) => {
    await openShell(page);
    await page.locator("#shell").evaluate((host) => {
      host.setAttribute("skip-label", "Jump to the page");
    });
    await expect(page.locator("#shell").locator('[part="skip"]')).toHaveText("Jump to the page");
  });
});

test.describe("collapsed navigation", () => {
  test("a toggle that says what it does opens and closes a panel in the page", async ({ page }) => {
    await openShell(page, { width: 390, layout: "top-bar" });
    const toggle = page.locator("#shell").locator('[part="toggle"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAccessibleName("Menu");
    expect(await isNavigationDrawn(page)).toBe(false);
    expect(await drawerState(page)).toMatchObject({ expanded: "false", open: false });
    await toggle.click();
    await expect.poll(async () => (await drawerState(page)).expanded).toBe("true");
    const opened = await regions(page);
    expect(opened.navigation.shown).toBe(true);
    expect(await drawerState(page)).toMatchObject({ open: true, modal: false, attribute: true });
    expectAbove(opened.toggle, opened.navigation, "the panel opens below the toggle");
    expectAbove(opened.navigation, opened.main, "and pushes the content down");
  });

  test("a disclosure leaves focus on the toggle, does not trap and does not make the page inert", async ({
    page,
  }) => {
    await openShell(page, { width: 390, layout: "top-bar" });
    await openNavigation(page);
    expect((await focusInfo(page)).region).toBe("toggle");
    await page.keyboard.press("Tab");
    expect((await focusInfo(page)).region).toBe("navigation");
    await page.locator("#main-link").focus();
    expect(await focusInfo(page)).toEqual({ region: "main", id: "main-link" });
  });

  test("Escape closes a disclosure and returns focus to the toggle", async ({ page }) => {
    await openShell(page, { width: 390, layout: "top-bar" });
    await openNavigation(page);
    await page.keyboard.press("Tab");
    expect((await focusInfo(page)).region).toBe("navigation");
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await drawerState(page)).expanded).toBe("false");
    expect(await focusInfo(page)).toMatchObject({ region: "toggle" });
    expect(await isNavigationDrawn(page)).toBe(false);
  });

  test("a drawer is modal: focus goes in, stays in and the page behind is inert", async ({
    page,
  }) => {
    await openShell(page, { width: 390, layout: "side-rail" });
    await openNavigation(page);
    expect(await drawerState(page)).toMatchObject({ open: true, modal: true, scrollLocked: true });
    expect(["close", "navigation"]).toContain((await focusInfo(page)).region);
    await page.locator("#main-link").evaluate((link) => {
      link.focus();
    });
    expect(["close", "navigation"], "an inert link cannot take focus").toContain(
      (await focusInfo(page)).region,
    );
    for (let index = 0; index < 14; index += 1) {
      await page.keyboard.press("Tab");
      expect(["close", "navigation"], `Tab ${String(index)} stays in the drawer`).toContain(
        (await focusInfo(page)).region,
      );
    }
    const inert = await page.evaluate(() => {
      const link = document.getElementById("main-link");
      return link ? link.matches(":not(:modal *)") : false;
    });
    expect(inert).toBe(true);
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  });

  test("Escape closes a drawer, gives back the page and returns focus to the toggle", async ({
    page,
  }) => {
    await openShell(page, { width: 390, layout: "side-rail" });
    await openNavigation(page);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await drawerState(page)).open).toBe(false);
    expect(await drawerState(page)).toMatchObject({
      expanded: "false",
      modal: false,
      attribute: false,
      scrollLocked: false,
    });
    expect(await focusInfo(page)).toMatchObject({ region: "toggle" });
    await page.locator("#main-link").focus();
    expect(await focusInfo(page)).toEqual({ region: "main", id: "main-link" });
  });

  test("the close button and a press on the backdrop close a drawer too", async ({ page }) => {
    await openShell(page, { width: 390, layout: "side-rail" });
    await openNavigation(page);
    await page.locator("#shell").locator('[part="close"]').click();
    await expect.poll(async () => (await drawerState(page)).open).toBe(false);
    expect(await focusInfo(page)).toMatchObject({ region: "toggle" });
    await openNavigation(page);
    await page.mouse.click(385, 400);
    await expect.poll(async () => (await drawerState(page)).open).toBe(false);
    expect(await focusInfo(page)).toMatchObject({ region: "toggle" });
  });

  test("following a link in the drawer closes it", async ({ page }) => {
    await openShell(page, { width: 390, layout: "side-rail" });
    await openNavigation(page);
    await page.locator("#nav-last").click();
    await expect.poll(async () => (await drawerState(page)).open).toBe(false);
    expect((await drawerState(page)).scrollLocked).toBe(false);
  });

  test("the immersive layout keeps the navigation behind a toggle at every width", async ({
    page,
  }) => {
    for (const width of [390, 768, 1280, 2560]) {
      await openShell(page, { width, layout: "immersive" });
      expect(await isToggleDrawn(page), `${String(width)}px`).toBe(true);
      expect(await isNavigationDrawn(page), `${String(width)}px`).toBe(false);
    }
    await openNavigation(page);
    expect(await drawerState(page)).toMatchObject({ open: true, modal: true });
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await drawerState(page)).open).toBe(false);
    expect(await focusInfo(page)).toMatchObject({ region: "toggle" });
  });

  test("growing the window closes the drawer and leaves nothing inert or locked", async ({
    page,
  }) => {
    await openShell(page, { width: 390, layout: "side-rail" });
    await openNavigation(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(async () => (await drawerState(page)).open).toBe(false);
    expect(await drawerState(page)).toMatchObject({
      expanded: "false",
      attribute: false,
      scrollLocked: false,
    });
    expect(await isToggleDrawn(page)).toBe(false);
    expect(await isNavigationDrawn(page)).toBe(true);
    await page.locator("#main-link").focus();
    expect(await focusInfo(page)).toEqual({ region: "main", id: "main-link" });
  });

  test("growing the container, not the window, does the same, without a frame of the open drawer", async ({
    page,
  }) => {
    await openShell(page, { width: 1280, layout: "side-rail" });
    await setShellWidth(page, "360px");
    await expect.poll(() => isToggleDrawn(page)).toBe(true);
    await openNavigation(page);
    await page.evaluate(() => {
      const drawer = document
        .getElementById("shell")
        ?.shadowRoot?.querySelector<HTMLDialogElement>('[part="drawer"]');
      const seen: boolean[] = [];
      (window as unknown as { __seen: boolean[] }).__seen = seen;
      const sample = () => {
        if (drawer) seen.push(drawer.checkVisibility());
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await setShellWidth(page, "");
    await expect.poll(async () => (await drawerState(page)).open).toBe(false);
    await frames(page, 3);
    const seen = await page.evaluate(() => (window as unknown as { __seen: boolean[] }).__seen);
    expect(seen.length).toBeGreaterThan(2);
    expect(seen.includes(true), "no frame drew the drawer once the container grew").toBe(false);
    expect(await drawerState(page)).toMatchObject({ scrollLocked: false, attribute: false });
  });

  test("moves with the motion preference: no slide under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openShell(page, { width: 390, layout: "side-rail" });
    await openNavigation(page);
    const reduced = await partStyle(page, "drawer", "transition-duration");
    expect(reduced).toBe("0.001s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await frames(page);
    const moving = {
      duration: await partStyle(page, "drawer", "transition-duration"),
      property: await partStyle(page, "drawer", "transition-property"),
    };
    expect(moving.property).toContain("translate");
    expect(moving.duration).not.toBe("0.001s");
  });
});

test.describe("switching the layout while the page is open", () => {
  test.setTimeout(120_000);

  for (const from of LAYOUTS) {
    test(`from ${from} to every layout keeps focus on a link in main and the scroll position`, async ({
      page,
    }) => {
      await openShell(page, { layout: from });
      for (const to of LAYOUTS) {
        await setLayout(page, from);
        await frames(page);
        await page.evaluate(() => {
          window.scrollTo(0, 600);
          document.getElementById("main-link")?.focus({ preventScroll: true });
        });
        await frames(page, 1);
        const before = await page.evaluate(() => window.scrollY);
        await setLayout(page, to);
        await frames(page, 3);
        await expect
          .poll(async () => (await focusInfo(page)).id, `${from} to ${to}: focus`)
          .toBe("main-link");
        await expect
          .poll(() => page.evaluate(() => window.scrollY), `${from} to ${to}: scroll`)
          .toBeCloseTo(before, -0.5);
        expect(
          Math.abs((await page.evaluate(() => window.scrollY)) - before),
          `${from} to ${to}: scroll`,
        ).toBeLessThanOrEqual(2);
      }
    });
  }

  test("focus in the navigation stays there while the navigation is drawn, and goes to the toggle when it collapses", async ({
    page,
  }) => {
    await openShell(page, { layout: "side-rail" });
    await page.locator("#nav-last").focus();
    await setLayout(page, "magazine");
    await frames(page, 3);
    expect(await focusInfo(page)).toEqual({ region: "navigation", id: "nav-last" });
    await setLayout(page, "immersive");
    await frames(page, 3);
    await expect.poll(() => focusInfo(page)).toMatchObject({ region: "toggle" });
  });

  test("an open disclosure is left open by a layout that also collapses, and reset by one that does not", async ({
    page,
  }) => {
    await openShell(page, { width: 768, layout: "top-bar" });
    await openNavigation(page);
    await setLayout(page, "bento");
    await frames(page, 3);
    expect(await drawerState(page)).toMatchObject({ open: true, modal: false });
    await setLayout(page, "side-rail");
    await frames(page, 3);
    await expect.poll(async () => (await drawerState(page)).open).toBe(false);
    expect(await drawerState(page)).toMatchObject({ attribute: false, scrollLocked: false });
  });

  test("creates and moves none of the page's own elements", async ({ page }) => {
    await openShell(page);
    const before = await page.locator("#shell").evaluate((host) => {
      const records: number[] = [];
      const observer = new MutationObserver((list) => {
        records.push(list.length);
      });
      observer.observe(host, { childList: true, subtree: true });
      (window as unknown as { __records: number[]; __observer: MutationObserver }).__records =
        records;
      (window as unknown as { __observer: MutationObserver }).__observer = observer;
      return Array.from(host.querySelectorAll("*")).length;
    });
    for (const layout of LAYOUTS) {
      await setLayout(page, layout);
      await frames(page, 3);
    }
    const after = await page.evaluate(() => {
      const target = window as unknown as { __observer: MutationObserver };
      const leftover = target.__observer.takeRecords().length;
      return { leftover, delivered: (window as unknown as { __records: number[] }).__records };
    });
    expect(after.delivered).toEqual([]);
    expect(after.leftover).toBe(0);
    expect(await page.locator("#shell").evaluate((host) => host.querySelectorAll("*").length)).toBe(
      before,
    );
  });
});

test.describe("right to left", () => {
  test("mirrors the rail, the aside and the hero", async ({ page }) => {
    await openShell(page, { direction: "rtl", layout: "side-rail" });
    let found = await regions(page);
    const width = await clientWidth(page);
    expect(found.navigation.right, "the rail is at the right").toBeCloseTo(width, -1);
    expect(found.main.right).toBeLessThanOrEqual(found.navigation.x + 1);

    await applyAxes(page, { layout: "dashboard" });
    found = await regions(page);
    expect(found.navigation.right, "the rail is at the right").toBeCloseTo(width, -1);
    expect(found.aside.x, "the inspector is at the left").toBeCloseTo(0, -1);
    expect(found.main.x).toBeGreaterThanOrEqual(found.aside.right - 1);

    await applyAxes(page, { layout: "top-bar" });
    found = await regions(page);
    expect(found.aside.right, "the aside is before main").toBeLessThanOrEqual(found.main.x + 1);

    await applyAxes(page, { layout: "split-hero" });
    found = await regions(page);
    expect(found.hero.x, "the hero is in the start half, at the right").toBeGreaterThanOrEqual(
      width / 2 - 1,
    );
    expect(found.main.right).toBeLessThanOrEqual(found.hero.x + 1);
  });

  test("slides the drawer in from the start side", async ({ page }) => {
    await openShell(page, { width: 390, direction: "rtl", layout: "side-rail" });
    await openNavigation(page);
    await settle(page);
    const edge = await page.locator("#shell").evaluate((host) => {
      const box = host.shadowRoot?.querySelector('[part="drawer"]')?.getBoundingClientRect();
      return { right: box?.right ?? 0, left: box?.left ?? 0 };
    });
    expect(edge.right).toBeCloseTo(await clientWidth(page), 0);
    expect(edge.left).toBeGreaterThan(0);
  });
});

test.describe("pinned chrome and scrolling a focused element into view", () => {
  const INSET: Record<string, number> = { "top-bar": 4 * REM, dashboard: 3.5 * REM };

  for (const layout of LAYOUTS) {
    test(`${layout} pads the page's scroll by what stays pinned`, async ({ page }) => {
      await openShell(page, { layout });
      const padding = await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollPaddingBlockStart,
      );
      expect(padding).toBe(`${String(INSET[layout] ?? 0)}px`);
    });
  }
});

test.describe("accessibility", () => {
  test.setTimeout(180_000);

  for (const width of [320, 1280]) {
    for (const layout of LAYOUTS) {
      test(`${layout} at ${String(width)}px has no axe violation in any UX mode`, async ({
        page,
      }) => {
        await openShell(page, { width, layout });
        for (const ux of UX_MODES) {
          await applyAxes(page, { ux });
          await frames(page);
          await expectNoAxeViolations(page);
        }
      });
    }
  }

  for (const layout of LAYOUTS) {
    test(`${layout} with the navigation open at 320px has no axe violation`, async ({ page }) => {
      await openShell(page, { width: 320, layout });
      await openNavigation(page);
      await settle(page);
      await expectNoAxeViolations(page);
    });
  }
});

test.describe("security", () => {
  test("the shell works under the strict policy without a console message", async ({ page }) => {
    // Every page is served under it, and the fixture fails on any console error, so reaching a
    // hydrated, switched and opened shell is the test.
    await openShell(page, { width: 390, layout: "immersive" });
    await openNavigation(page);
    await page.keyboard.press("Escape");
    await setLayout(page, "bento");
    await frames(page);
    expect(
      await page.locator("#shell").evaluate((host) => host.classList.contains("hydrated")),
    ).toBe(true);
  });
});
