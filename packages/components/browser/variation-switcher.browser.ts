import type { Page } from "@playwright/test";
import { REGISTRY } from "@identgineer/variations";
import { bootstrapScriptAttributes } from "@identgineer/variations/bootstrap-tag";
import { expectNoAxeViolations } from "./accessibility";
import { applyAxes, DESIGNS, LAYOUTS, SCHEMES, UX_MODES } from "./axes";
import { expect, test } from "./fixtures";
import { frames } from "./layout-shell-page";
import { setTextSize, TEXT_SIZES, type TextSize } from "./text-size";

const PAGE = "/fixtures/variation-switcher.html";
const MAIN = "#switcher";
const ASIDE = "#switcher-aside";
const ATTRIBUTES = ["data-theme", "data-design", "data-layout", "data-ux", "data-scheme"] as const;

type Control = "theme" | "design" | "layout" | "ux" | "scheme";

async function open(page: Page, width = 1280, query = ""): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${PAGE}${query}`);
  await expect(
    page.locator("idg-layout:not(.hydrated), idg-variation-switcher:not(.hydrated)"),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await frames(page);
}

function rootAttribute(page: Page, name: string): Promise<string | null> {
  return page.evaluate((attribute) => document.documentElement.getAttribute(attribute), name);
}

async function rootState(page: Page): Promise<Record<string, string | null>> {
  const entries: [string, string | null][] = [];
  for (const name of ATTRIBUTES) entries.push([name, await rootAttribute(page, name)]);
  return Object.fromEntries(entries);
}

/** Uses a control the way a pointer user does: a radio is clicked, a select is chosen from. */
async function choose(page: Page, control: Control, value: string, switcher = MAIN): Promise<void> {
  const field = page.locator(`${switcher} idg-field[data-control="${control}"]`);
  if (control === "theme" || control === "scheme") {
    await field.locator(`idg-radio[value="${value}"] input`).check();
  } else {
    await field.locator("select").selectOption(value);
  }
  await frames(page);
}

function checkedValue(page: Page, control: Control, switcher = MAIN): Promise<string> {
  return page
    .locator(`${switcher} idg-field[data-control="${control}"]`)
    .locator("idg-radio-group, idg-select")
    .evaluate((element) => (element as unknown as { value: string }).value);
}

function status(page: Page, switcher = MAIN) {
  return page.locator(`${switcher} [role="status"]`);
}

test.describe("the switcher hydrates under the strict policy", () => {
  test("draws five labelled controls from the registry", async ({ page }) => {
    await open(page);
    const names = await page
      .locator(`${MAIN} idg-field`)
      .evaluateAll((fields) =>
        fields.map((field) => (field as unknown as { label: string }).label),
      );
    expect(names).toEqual(["Theme", "Design", "Layout", "UX", "Scheme"]);
    for (const axis of ["design", "layout", "ux"] as const) {
      await expect(
        page.locator(`${MAIN} idg-field[data-control="${axis}"] idg-select > option`),
      ).toHaveCount(REGISTRY[axis].variations.length);
    }
    await expect(page.locator(`${MAIN} idg-radio svg.swatch`)).toHaveCount(8);
    await expect(page.getByRole("group", { name: "Customise this page" })).toBeVisible();
  });

  test("every control has an accessible name", async ({ page }) => {
    await open(page);
    await expect(page.locator(MAIN).getByRole("combobox")).toHaveCount(3);
    for (const name of ["Design", "Layout", "UX"]) {
      await expect(page.locator(MAIN).getByRole("combobox", { name })).toBeVisible();
    }
    await expect(page.locator(MAIN).getByRole("radiogroup", { name: "Theme" })).toBeVisible();
    await expect(page.locator(MAIN).getByRole("radiogroup", { name: "Scheme" })).toBeVisible();
    for (const name of ["Surprise me", "Reset", "Copy link"]) {
      await expect(page.locator(MAIN).getByRole("button", { name })).toBeVisible();
    }
  });

  test("draws the swatches with fill attributes and no inline style", async ({ page }) => {
    await open(page);
    const aurora = REGISTRY.theme.variations[0];
    if (aurora?.preview.kind !== "theme") throw new Error("no theme swatches");
    const swatch = await page
      .locator(`${MAIN} idg-radio[value="aurora"] svg.swatch`)
      .evaluate((svg) => ({
        fills: Array.from(svg.querySelectorAll("rect")).map((rect) => rect.getAttribute("fill")),
        painted: Array.from(svg.querySelectorAll("rect")).map(
          (rect) => getComputedStyle(rect).fill,
        ),
        styled: svg.querySelectorAll("[style]").length,
      }));
    expect(swatch.fills).toContain(aurora.preview.swatches.light.accent);
    expect(swatch.fills).toContain(aurora.preview.swatches.dark.bg);
    expect(swatch.styled).toBe(0);
    // The fill is really painted: the computed colour is the registry's, as rgb().
    const hex = aurora.preview.swatches.light.accent.slice(1);
    const rgb = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
    expect(swatch.painted).toContain(`rgb(${rgb.join(", ")})`);
  });
});

test.describe("each control changes the page", () => {
  test("every control sets its own root attribute and the choice is shown", async ({ page }) => {
    await open(page);
    const picks = [
      ["theme", "ember", "data-theme"],
      ["design", "brutalist", "data-design"],
      ["layout", "side-rail", "data-layout"],
      ["ux", "spacious", "data-ux"],
      ["scheme", "dark", "data-scheme"],
    ] as const;
    for (const [control, value, attribute] of picks) {
      await choose(page, control, value);
      expect(await rootAttribute(page, attribute)).toBe(value);
      expect(await checkedValue(page, control)).toBe(value);
    }
  });

  test("the theme changes the colours", async ({ page }) => {
    await open(page);
    const read = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return [
          style.getPropertyValue("--idg-color-accent"),
          getComputedStyle(document.body).getPropertyValue("--idg-color-bg"),
          getComputedStyle(document.querySelector("idg-layout") as Element).backgroundColor,
        ].join("|");
      });
    const before = await read();
    await choose(page, "theme", "ember");
    expect(await read()).not.toBe(before);
  });

  test("the design changes the shape and the shadow of a card", async ({ page }) => {
    await open(page);
    const read = () =>
      page
        .locator("#cards idg-card")
        .first()
        .locator(".card")
        .evaluate((card) => {
          const style = getComputedStyle(card);
          return [style.borderTopWidth, style.borderTopLeftRadius, style.boxShadow].join("|");
        });
    const before = await read();
    await choose(page, "design", "brutalist");
    expect(await read()).not.toBe(before);
  });

  test("the UX mode changes the size of a button", async ({ page }) => {
    await open(page);
    const read = () =>
      page
        .locator("#cards idg-button")
        .first()
        .locator("button")
        .evaluate((button) => button.getBoundingClientRect().height);
    const before = await read();
    await choose(page, "ux", "spacious");
    expect(await read()).toBeGreaterThan(before);
  });

  test("the layout changes where the regions are", async ({ page }) => {
    await open(page);
    const read = () =>
      page.evaluate(() => {
        const box = (selector: string) => {
          const rect = document.querySelector(selector)?.getBoundingClientRect();
          return rect ? [Math.round(rect.x), Math.round(rect.y)].join(",") : "none";
        };
        return ["#shell > [slot=navigation]", "#shell > [slot=aside]", "#shell > [slot=hero]"]
          .map(box)
          .join("|");
      });
    const seen = new Set<string>([await read()]);
    for (const layout of ["side-rail", "magazine", "centered"]) {
      await choose(page, "layout", layout);
      seen.add(await read());
    }
    // Each of those arranges the regions differently from the default and from one another.
    expect(seen.size).toBe(4);
  });

  test("Surprise me changes the four axes and keeps the scheme", async ({ page }) => {
    await open(page);
    await choose(page, "scheme", "dark");
    const before = await rootState(page);
    await page.locator(MAIN).getByRole("button", { name: "Surprise me" }).click();
    await frames(page);
    const after = await rootState(page);
    expect(after["data-scheme"]).toBe("dark");
    expect(after).not.toEqual(before);
    for (const axis of ["theme", "design", "layout", "ux"] as const) {
      expect(await checkedValue(page, axis)).toBe(after[`data-${axis}`]);
    }
    await expect(status(page)).toContainText("Shuffled.");
  });

  test("Reset removes every attribute", async ({ page }) => {
    await open(page);
    await choose(page, "theme", "ember");
    await choose(page, "scheme", "light");
    await page.locator(MAIN).getByRole("button", { name: "Reset" }).click();
    await frames(page);
    expect(Object.values(await rootState(page)).every((value) => value === null)).toBe(true);
    expect(await checkedValue(page, "theme")).toBe("aurora");
    expect(await checkedValue(page, "scheme")).toBe("system");
  });

  test("emits idgVariationsChange only for a change made through the panel", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const log: unknown[] = [];
      (window as unknown as { __events: unknown[] }).__events = log;
      document.querySelector("#switcher")?.addEventListener("idgVariationsChange", (event) => {
        log.push((event as CustomEvent).detail);
      });
    });
    await choose(page, "design", "glass");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-ux", "compact");
    });
    await frames(page);
    const events = await page.evaluate(
      () => (window as unknown as { __events: unknown[] }).__events,
    );
    expect(events).toEqual([
      expect.objectContaining({
        changed: ["design"],
        state: expect.objectContaining({ design: "glass" }),
      }),
    ]);
    // The outside change is still shown.
    expect(await checkedValue(page, "ux")).toBe("compact");
  });
});

test.describe("two switchers", () => {
  test("stay in sync through the page, in both directions", async ({ page }) => {
    await open(page);
    await choose(page, "theme", "tidal");
    expect(await checkedValue(page, "theme", ASIDE)).toBe("tidal");
    await choose(page, "scheme", "dark", ASIDE);
    expect(await checkedValue(page, "scheme")).toBe("dark");
    expect(await rootAttribute(page, "data-scheme")).toBe("dark");
  });

  test("follow a change made by markup or a script", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "paper");
    });
    await expect.poll(() => checkedValue(page, "theme")).toBe("paper");
    await expect.poll(() => checkedValue(page, "theme", ASIDE)).toBe("paper");
  });

  test("a removed switcher stops listening: it no longer follows the page", async ({ page }) => {
    await open(page);
    // Only a live listener makes a switcher show a change, so a removed one that still shows it is
    // one that leaked its subscription.
    await page.evaluate(() => {
      const aside = document.querySelector("#switcher-aside");
      (window as unknown as { __removed: Element | null }).__removed = aside;
      aside?.remove();
    });
    await choose(page, "theme", "citrus");
    await expect.poll(() => checkedValue(page, "theme")).toBe("citrus");
    await frames(page, 4);
    const removed = await page.evaluate(() => {
      const element = (window as unknown as { __removed: Element }).__removed;
      const group = element.shadowRoot?.querySelector(
        'idg-field[data-control="theme"] idg-radio-group',
      );
      return (group as unknown as { value: string } | null)?.value;
    });
    expect(removed).toBe("aurora");
  });
});

test.describe("the keyboard alone", () => {
  async function activeInfo(page: Page) {
    return page.evaluate(() => {
      let element: Element | null = document.activeElement;
      while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
      if (!element) return { tag: "", label: "", outline: "none" };
      const style = getComputedStyle(element);
      const text = element.closest("label")?.textContent.trim() ?? "";
      return {
        tag: element.tagName,
        label: element.getAttribute("aria-label") ?? text,
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
      };
    });
  }

  async function tabToSwitcher(page: Page): Promise<void> {
    for (let presses = 0; presses < 40; presses += 1) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.id === "switcher")) return;
    }
    throw new Error("the switcher was never reached with Tab");
  }

  test("every control can be reached and operated", async ({ page }) => {
    await open(page);
    await tabToSwitcher(page);

    // Theme: one tab stop, and the arrows choose.
    let focus = await activeInfo(page);
    expect(focus.tag).toBe("INPUT");
    expect(focus.outline).not.toMatch(/^none|\b0px$/);
    await page.keyboard.press("ArrowRight");
    expect(await rootAttribute(page, "data-theme")).toBe("ember");

    // Design, layout and UX are selects: the arrow keys choose.
    for (const [axis, next] of [
      ["design", "soft"],
      ["layout", "side-rail"],
      ["ux", "compact"],
    ] as const) {
      await page.keyboard.press("Tab");
      focus = await activeInfo(page);
      expect(focus.tag).toBe("SELECT");
      expect(focus.label).toBe({ design: "Design", layout: "Layout", ux: "UX" }[axis]);
      await page.keyboard.press("ArrowDown");
      expect(await rootAttribute(page, `data-${axis}`)).toBe(next);
    }

    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    expect(await rootAttribute(page, "data-scheme")).toBe("light");

    // The actions: Enter on one, Space on the next.
    const before = await rootState(page);
    await page.keyboard.press("Tab");
    focus = await activeInfo(page);
    expect(focus.tag).toBe("BUTTON");
    expect(focus.outline).not.toMatch(/^none|\b0px$/);
    await page.keyboard.press("Enter");
    await frames(page);
    expect(await rootState(page)).not.toEqual(before);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await frames(page);
    expect(Object.values(await rootState(page)).every((value) => value === null)).toBe(true);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(status(page)).toContainText(/Link copied|could not be copied/);
  });

  test("a right to left page reverses the arrows of the theme", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute("dir", "rtl");
    });
    await tabToSwitcher(page);
    await page.keyboard.press("ArrowLeft");
    expect(await rootAttribute(page, "data-theme")).toBe("ember");
  });
});

test.describe("copy link and the share link round trip", () => {
  test("copies a link that restores the choice before the page is parsed further", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    await choose(page, "theme", "ember");
    await choose(page, "design", "glass");
    await choose(page, "layout", "bento");
    await choose(page, "ux", "focus");
    await choose(page, "scheme", "dark");
    await page.locator(MAIN).getByRole("button", { name: "Copy link" }).click();
    await expect(status(page)).toHaveText("Link copied.");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const url = new URL(link);
    expect(url.pathname).toBe(PAGE);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      "idg-theme": "ember",
      "idg-design": "glass",
      "idg-layout": "bento",
      "idg-ux": "focus",
      "idg-scheme": "dark",
    });

    const recipient = await context.newPage();
    await recipient.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.documentElement;
        (window as unknown as { __early: Record<string, string | null> }).__early = {
          theme: root.getAttribute("data-theme"),
          design: root.getAttribute("data-design"),
          layout: root.getAttribute("data-layout"),
          ux: root.getAttribute("data-ux"),
          scheme: root.getAttribute("data-scheme"),
        };
      });
    });
    await recipient.goto(link);
    const early = await recipient.evaluate(
      () => (window as unknown as { __early: Record<string, string | null> }).__early,
    );
    expect(early).toEqual({
      theme: "ember",
      design: "glass",
      layout: "bento",
      ux: "focus",
      scheme: "dark",
    });
    // The script that did it is the built bootstrap, held to its integrity by the browser.
    const tag = await recipient
      .locator('script[src="/variations/bootstrap.js"]')
      .getAttribute("integrity");
    expect(tag).toBe(bootstrapScriptAttributes("/variations/bootstrap.js").integrity);
    await expect(recipient.locator("idg-variation-switcher:not(.hydrated)")).toHaveCount(0);
    expect(
      await recipient
        .locator(`${MAIN} idg-field[data-control="theme"] idg-radio-group`)
        .evaluate((group) => (group as unknown as { value: string }).value),
    ).toBe("ember");
    await recipient.close();
  });

  test("offers the link to copy by hand when the clipboard refuses", async ({ page }) => {
    await open(page);
    await choose(page, "theme", "ember");
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
      });
    });
    await page.locator(MAIN).getByRole("button", { name: "Copy link" }).click();
    await expect(status(page)).toContainText("could not be copied");
    const input = page.locator(`${MAIN} .fallback input`);
    await expect(input).toBeVisible();
    await expect(input).toHaveValue(/idg-theme=ember/);
    await expect(input).toBeFocused();
    await expect(input).toHaveJSProperty("readOnly", true);
  });
});

test.describe("the live region and the manual link", () => {
  /** Counts what is added to the live region, which is what a screen reader announces. */
  async function watchStatus(page: Page): Promise<void> {
    await page.evaluate(() => {
      const region = document
        .querySelector("#switcher")
        ?.shadowRoot?.querySelector('[role="status"]');
      const state = window as unknown as { __additions: number };
      state.__additions = 0;
      if (!region) throw new Error("no live region");
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "characterData" && record.target.textContent) state.__additions += 1;
          for (const node of record.addedNodes) if (node.textContent) state.__additions += 1;
        }
      }).observe(region, { childList: true, subtree: true, characterData: true });
    });
  }

  const additions = (page: Page) =>
    page.evaluate(() => (window as unknown as { __additions: number }).__additions);

  test("an identical message is announced again", async ({ page }) => {
    await open(page);
    await watchStatus(page);
    await choose(page, "theme", "ember");
    await expect.poll(() => additions(page)).toBeGreaterThan(0);
    const first = await additions(page);
    await page.evaluate(() => {
      document.documentElement.removeAttribute("data-theme");
    });
    await frames(page);
    await choose(page, "theme", "ember");
    await expect(status(page)).toHaveText("Theme: Ember.");
    expect(await additions(page)).toBeGreaterThan(first);
  });

  test("a second copy is announced again", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page);
    await watchStatus(page);
    const copy = page.locator(MAIN).getByRole("button", { name: "Copy link" });
    await copy.click();
    await expect(status(page)).toHaveText("Link copied.");
    const first = await additions(page);
    await copy.click();
    await expect.poll(() => additions(page)).toBeGreaterThan(first);
  });

  async function refuseClipboard(page: Page): Promise<void> {
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
      });
    });
  }

  test("the manual link is focused with its text selected", async ({ page }) => {
    await open(page);
    await choose(page, "theme", "ember");
    await refuseClipboard(page);
    await page.locator(MAIN).getByRole("button", { name: "Copy link" }).click();
    const input = page.locator(`${MAIN} .fallback input`);
    await expect(input).toBeFocused();
    await expect
      .poll(() =>
        input.evaluate((element: HTMLInputElement) => [
          element.selectionStart,
          element.selectionEnd,
          element.value.length,
        ]),
      )
      .toEqual([0, expect.any(Number), expect.any(Number)]);
    const [start, end, length] = await input.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
      element.value.length,
    ]);
    expect(start).toBe(0);
    expect(end).toBe(length);
    expect(length).toBeGreaterThan(0);
  });

  test("the manual link stays, with its message, when Reset has nothing to change", async ({
    page,
  }) => {
    await open(page);
    await refuseClipboard(page);
    await page.locator(MAIN).getByRole("button", { name: "Copy link" }).click();
    await expect(page.locator(`${MAIN} .fallback input`)).toBeVisible();
    await page.locator(MAIN).getByRole("button", { name: "Reset" }).click();
    await expect(page.locator(`${MAIN} .fallback input`)).toBeVisible();
    await expect(status(page)).toContainText("copy it yourself");
    await choose(page, "theme", "ember");
    await expect(page.locator(`${MAIN} .fallback`)).toHaveCount(0);
    await expect(status(page)).not.toContainText("copy it yourself");
  });

  test("the manual link goes when the page changes, so it never says something old", async ({
    page,
  }) => {
    await open(page);
    await refuseClipboard(page);
    await page.locator(MAIN).getByRole("button", { name: "Copy link" }).click();
    await expect(page.locator(`${MAIN} .fallback input`)).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "paper");
    });
    await expect(page.locator(`${MAIN} .fallback`)).toHaveCount(0);
    await expect(status(page)).toHaveText("");
  });
});

test.describe("persistence", () => {
  test("remembers the choice across a reload when persist is set", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      document.querySelector("#switcher")?.setAttribute("persist", "");
    });
    await choose(page, "theme", "ember");
    await choose(page, "ux", "compact");
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.documentElement;
        (window as unknown as { __early: string[] }).__early = [
          root.getAttribute("data-theme") ?? "",
          root.getAttribute("data-ux") ?? "",
        ];
      });
    });
    await page.reload();
    expect(await page.evaluate(() => (window as unknown as { __early: string[] }).__early)).toEqual(
      ["ember", "compact"],
    );
    await expect(page.locator("idg-variation-switcher:not(.hydrated)")).toHaveCount(0);
    expect(await checkedValue(page, "theme")).toBe("ember");
  });

  test("keeps nothing without persist", async ({ page }) => {
    await open(page);
    await choose(page, "theme", "ember");
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.reload();
    expect(await rootAttribute(page, "data-theme")).toBeNull();
  });
});

test.describe("layout holds up", () => {
  const SIZES: readonly TextSize[] = [
    ...TEXT_SIZES,
    { label: "200%", fontSize: "200%", wide: false },
    { label: "200% with wide text", fontSize: "200%", wide: true },
  ];

  async function expectFits(page: Page, label: string): Promise<void> {
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const problems: string[] = [];
      if (root.scrollWidth > root.clientWidth) {
        problems.push(`page scrolls sideways by ${String(root.scrollWidth - root.clientWidth)}`);
      }
      for (const host of document.querySelectorAll("idg-variation-switcher")) {
        const hostBox = host.getBoundingClientRect();
        const panel = host.shadowRoot?.querySelector(".panel");
        if (!panel) continue;
        for (const element of panel.querySelectorAll("*")) {
          const box = element.getBoundingClientRect();
          if (box.width === 0) continue;
          if (box.right > hostBox.right + 1 || box.left < hostBox.left - 1) {
            problems.push(`${host.id}: ${element.tagName} leaves the panel`);
            break;
          }
        }
      }
      return problems;
    });
    expect(overflow, label).toEqual([]);
  }

  /** Whether anything in a panel, nested shadow roots included, sticks out of the panel's box. */
  async function expectDeepFit(page: Page, label: string): Promise<void> {
    const problems = await page.evaluate(() => {
      const found: string[] = [];
      for (const host of document.querySelectorAll("idg-variation-switcher")) {
        const panel = host.shadowRoot?.querySelector(".panel");
        if (!panel) continue;
        const edge = panel.getBoundingClientRect();
        const walk = (root: Document | ShadowRoot | Element, path: string): void => {
          for (const element of root.querySelectorAll("*")) {
            const box = element.getBoundingClientRect();
            if (box.width > 0 && (box.right > edge.right + 0.5 || box.left < edge.left - 0.5)) {
              found.push(`${host.id}: ${path}${element.localName}.${element.className}`);
            }
            if (element.shadowRoot) walk(element.shadowRoot, `${path}${element.localName}>`);
          }
        };
        walk(panel, "");
      }
      return found;
    });
    expect(problems, label).toEqual([]);
  }

  for (const ux of UX_MODES) {
    test(`nothing sticks out of the panel at 320px, 200% wide text, in the ${ux} mode`, async ({
      page,
    }) => {
      await open(page, 320);
      await applyAxes(page, { ux });
      await setTextSize(page, { label: "200% with wide text", fontSize: "200%", wide: true });
      await frames(page);
      await expectDeepFit(page, `${ux} stacked`);
      await page.evaluate(() => {
        for (const element of document.querySelectorAll("idg-variation-switcher")) {
          element.setAttribute("orientation", "inline");
        }
      });
      await frames(page);
      await expectDeepFit(page, `${ux} inline`);
    });
  }

  /**
   * No text of the switcher, in any shadow root, is drawn
   * past the edge of the window. The text itself is measured with ranges: a word wider than its
   * box spills out of it without making the box wider, so comparing boxes misses it.
   */
  async function expectTextInside(page: Page, label: string): Promise<void> {
    const problems = await page.evaluate(() => {
      const found: string[] = [];
      const root = document.documentElement;
      const limit = root.clientWidth + 0.5;
      const range = document.createRange();
      const walk = (scope: Document | ShadowRoot | Element, path: string): void => {
        for (const element of scope.querySelectorAll("*")) {
          // Text for assistive technology only is clipped to a pixel, and is not drawn.
          const hidden = element.getBoundingClientRect().width <= 1;
          for (const node of hidden ? [] : Array.from(element.childNodes)) {
            if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? "").trim() === "")
              continue;
            range.selectNodeContents(node);
            for (const box of Array.from(range.getClientRects())) {
              if (box.right > limit || box.left < -0.5) {
                found.push(`${path}${element.localName}: "${(node.textContent ?? "").trim()}"`);
                break;
              }
            }
          }
          if (element.shadowRoot) walk(element.shadowRoot, `${path}${element.localName}>`);
        }
      };
      for (const host of document.querySelectorAll("idg-variation-switcher")) {
        if (host.shadowRoot) walk(host.shadowRoot, "");
      }
      return found;
    });
    expect(problems, label).toEqual([]);
  }

  for (const design of DESIGNS) {
    for (const ux of UX_MODES) {
      test(`nothing of the switcher is drawn past the window at 320px, 200% text, in the ${design} design and the ${ux} mode`, async ({
        page,
      }) => {
        await open(page, 320);
        await applyAxes(page, { ux, design });
        await setTextSize(page, { label: "200%", fontSize: "200%", wide: false });
        await frames(page);
        await expectTextInside(page, `${design} ${ux}`);
      });
    }
  }

  for (const width of [320, 390, 768, 1280, 1920]) {
    test(`no sideways scroll at ${String(width)}px, at every text size`, async ({ page }) => {
      await open(page, width);
      for (const size of SIZES) {
        await setTextSize(page, size);
        await frames(page);
        await expectFits(page, `${String(width)}px, ${size.label}`);
      }
    });
  }

  for (const layout of LAYOUTS) {
    test(`fits at 320px in the ${layout} layout, with wide text and in both orientations`, async ({
      page,
    }) => {
      await open(page, 320);
      await applyAxes(page, { layout });
      await setTextSize(page, { label: "200% with wide text", fontSize: "200%", wide: true });
      await expectFits(page, `${layout} stacked`);
      await page.evaluate(() => {
        for (const element of document.querySelectorAll("idg-variation-switcher")) {
          element.setAttribute("orientation", "inline");
        }
      });
      await frames(page);
      await expectFits(page, `${layout} inline`);
    });
  }

  for (const [name, selector] of [
    ["the main panel", MAIN],
    ["the aside panel", ASIDE],
  ] as const) {
    for (const width of [320, 390, 768, 1280]) {
      test(`${name} lays the theme and scheme options on aligned grids at ${String(width)}px`, async ({
        page,
      }) => {
        await open(page, width);
        const boxes = (control: string) =>
          page
            .locator(`${selector} idg-field[data-control="${control}"] idg-radio`)
            .evaluateAll((radios) =>
              radios.map((radio) => {
                const box = radio.getBoundingClientRect();
                return {
                  left: Math.round(box.left),
                  top: Math.round(box.top),
                  width: Math.round(box.width),
                };
              }),
            );
        const themes = await boxes("theme");
        expect(themes).toHaveLength(8);
        // One width for all, and each starts at one of a few column edges: a grid, not ragged rows.
        const widths = themes.map((box) => box.width);
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
        const columns = new Set(themes.map((box) => box.left)).size;
        expect([1, 2, 4]).toContain(columns);
        expect(Math.ceil(8 / columns)).toBe(new Set(themes.map((box) => box.top)).size);
        const schemes = await boxes("scheme");
        const oneRow = new Set(schemes.map((box) => box.top)).size === 1;
        const oneColumn = new Set(schemes.map((box) => box.left)).size === 1;
        // Three options in one row or one column, never two and one over.
        expect(oneRow || oneColumn).toBe(true);
      });
    }
  }

  test("the inline orientation puts controls side by side where there is room", async ({
    page,
  }) => {
    await open(page, 1920);
    await page.evaluate(() => {
      document.querySelector("#switcher")?.setAttribute("orientation", "inline");
    });
    await frames(page);
    const tops = await page
      .locator(`${MAIN} idg-field[data-control]`)
      .evaluateAll((fields) =>
        fields.map((field) => Math.round(field.getBoundingClientRect().top)),
      );
    expect(new Set(tops).size).toBeLessThan(tops.length);
  });

  test("a right to left page mirrors and still fits", async ({ page }) => {
    await open(page, 320);
    await page.evaluate(() => {
      document.documentElement.setAttribute("dir", "rtl");
    });
    await frames(page);
    await expectFits(page, "rtl");
    const [select, label] = await page.evaluate(() => {
      const field = document.querySelector('#switcher idg-field[data-control="design"]');
      return [
        field?.querySelector("idg-select")?.getBoundingClientRect().right ?? 0,
        field?.getBoundingClientRect().right ?? 0,
      ];
    });
    expect(Math.abs(select - label)).toBeLessThan(40);
  });

  for (const ux of UX_MODES) {
    test(`targets are at least the ${ux} mode's target size`, async ({ page }) => {
      await open(page);
      await applyAxes(page, { ux });
      const result = await page.evaluate(() => {
        const token = getComputedStyle(document.documentElement)
          .getPropertyValue("--idg-density-target-size")
          .trim();
        const probe = document.createElement("div");
        probe.style.inlineSize = token;
        document.body.append(probe);
        const minimum = probe.getBoundingClientRect().width;
        probe.remove();
        const small: string[] = [];
        const host = document.querySelector("#switcher");
        const measure = (name: string, element: Element | null | undefined) => {
          const box = element?.getBoundingClientRect();
          if (!box || box.height < minimum - 0.5) small.push(`${name} ${String(box?.height)}`);
        };
        for (const button of host?.shadowRoot?.querySelectorAll("idg-button") ?? []) {
          measure("button", button.shadowRoot?.querySelector("button"));
        }
        for (const select of host?.shadowRoot?.querySelectorAll("idg-select") ?? []) {
          measure("select", select.shadowRoot?.querySelector("select"));
        }
        for (const radio of host?.shadowRoot?.querySelectorAll("idg-radio") ?? []) {
          measure("radio", radio.shadowRoot?.querySelector("label"));
        }
        return { minimum, small };
      });
      expect(result.minimum).toBeGreaterThan(0);
      expect(result.small).toEqual([]);
    });
  }
});

test.describe("accessibility", () => {
  for (const ux of UX_MODES) {
    for (const scheme of SCHEMES) {
      test(`axe finds nothing in the ${ux} mode, ${scheme}`, async ({ page }) => {
        await open(page);
        await applyAxes(page, { ux, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`axe finds nothing in the ${design} design, ${scheme}`, async ({ page }) => {
        await open(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  test("axe finds nothing after a copy that falls back to the link", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
      });
    });
    await page.locator(MAIN).getByRole("button", { name: "Copy link" }).click();
    await expect(page.locator(`${MAIN} .fallback input`)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("forced colours keep the swatches and the focus visible", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page);
    const adjust = await page
      .locator(`${MAIN} idg-radio svg.swatch`)
      .first()
      .evaluate((svg) => getComputedStyle(svg).forcedColorAdjust);
    expect(adjust).toBe("none");
    await page.locator(MAIN).getByRole("button", { name: "Reset" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(MAIN).getByRole("button", { name: "Reset" })).toBeVisible();
  });

  test("reduced motion leaves the panel working", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await choose(page, "theme", "ember");
    expect(await rootAttribute(page, "data-theme")).toBe("ember");
  });
});

test.describe("policy", () => {
  test("no securitypolicyviolation event fires while the panel is used", async ({ page }) => {
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as unknown as { __violations: string[] }).__violations = log;
      document.addEventListener("securitypolicyviolation", (event) => {
        log.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    await open(page);
    await choose(page, "theme", "terminal");
    await choose(page, "design", "pixel");
    await choose(page, "scheme", "dark");
    await page.locator(MAIN).getByRole("button", { name: "Surprise me" }).click();
    await page.locator(MAIN).getByRole("button", { name: "Copy link" }).click();
    await page.locator(MAIN).getByRole("button", { name: "Reset" }).click();
    await frames(page);
    expect(
      await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations),
    ).toEqual([]);
  });
});
