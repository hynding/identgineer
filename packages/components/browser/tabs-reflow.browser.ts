import type { Page } from "@playwright/test";
import { DESIGNS, applyAxes } from "./axes";
import { expect, test } from "./fixtures";
import { hydrated, settleFrames } from "./reflow";
import { setBrowserTextSize, setTextSize } from "./text-size";

const PAGE = "/fixtures/navigation.html";

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(PAGE);
  await hydrated(page);
}

/**
 * Every word of the vertical tabs' labels and of the panel shown that has less room than it needs,
 * and every tab that reaches past its list onto the panel beside it.
 */
function brokenOrOverlapping(page: Page) {
  return page.evaluate(() => {
    const tabs = document.querySelector("#tabs-vertical");
    if (!tabs) throw new Error("no vertical tabs");
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("no canvas");
    const broken: string[] = [];
    const check = (what: string, text: string, style: CSSStyleDeclaration, room: number) => {
      context.font = style.font;
      const shown = style.textTransform === "uppercase" ? text.toUpperCase() : text;
      const spacing = Number.parseFloat(style.letterSpacing) || 0;
      for (const word of shown.split(/\s+/).filter(Boolean)) {
        const width = context.measureText(word).width + spacing * word.length;
        if (width > room + 1) {
          broken.push(
            `${what} "${word}": ${String(Math.round(width))}px in ${String(Math.round(room))}px`,
          );
        }
      }
    };
    const list = tabs.shadowRoot?.querySelector(".list")?.getBoundingClientRect();
    const panels = tabs.shadowRoot?.querySelector(".panels")?.getBoundingClientRect();
    if (!list || !panels) throw new Error("no list or panels");
    const beside = panels.top < list.bottom - 1;
    if (beside && panels.left < list.right - 1 && panels.right > list.left + 1) {
      broken.push(
        `the panel starts ${String(Math.round(list.right - panels.left))}px inside the list`,
      );
    }
    for (const tab of tabs.querySelectorAll("idg-tab")) {
      const label = tab.shadowRoot?.querySelector(".tab");
      if (!label) throw new Error("no tab label");
      const style = getComputedStyle(label);
      const box = label.getBoundingClientRect();
      const room =
        box.width -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight) -
        2 * Number.parseFloat(style.borderLeftWidth);
      check(`tab ${tab.textContent.trim()}`, tab.textContent.trim(), style, room);
      if (box.right > list.right + 0.5 || box.left < list.left - 0.5) {
        broken.push(`tab ${tab.textContent.trim()} reaches past its list`);
      }
    }
    for (const paragraph of tabs.querySelectorAll("idg-tab-panel p")) {
      if (!paragraph.checkVisibility()) continue;
      const style = getComputedStyle(paragraph);
      check("panel", paragraph.textContent, style, paragraph.getBoundingClientRect().width);
    }
    return broken;
  });
}

// A reader sets a larger text size in the browser's settings, and a media query measures in that
// size. The list is drawn above its panel by such a query, where the window is short of room for
// both (below 20rem, 640px at 200% text), and beside it from there up, so these are read with the
// browser's text size at 200% on either side of that width, a little below it (600px), in the
// narrowest window and at a tablet's width; in the wide face, whose longer words leave the least
// room, on either side of the query and at a tablet's width. No word of a label or of the panel
// breaks, and no tab reaches onto the panel.
const WORD_WIDTHS = [
  { wide: false, widths: [320, 600, 639, 640, 768] },
  { wide: true, widths: [639, 640, 768] },
] as const;
test.describe("vertical tabs keep their words whole and their tabs in their list with the browser's text at 200%", () => {
  for (const { wide, widths } of WORD_WIDTHS) {
    for (const width of widths) {
      test(`at ${String(width)}px, ${wide ? "wide" : "default"} text, in every design`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await open(page, width);
        await setBrowserTextSize(page, 200);
        await setTextSize(page, { label: "200%", fontSize: "100%", wide });
        const failures: string[] = [];
        for (const design of DESIGNS) {
          await applyAxes(page, { design });
          failures.push(...(await brokenOrOverlapping(page)).map((word) => `${design}: ${word}`));
        }
        expect(failures).toEqual([]);
      });
    }
  }
});

function arrangement(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector("#tabs-vertical");
    const list = host?.shadowRoot?.querySelector(".list")?.getBoundingClientRect();
    const panels = host?.shadowRoot?.querySelector(".panels")?.getBoundingClientRect();
    if (!list || !panels) throw new Error("no list or panels");
    return {
      beside: panels.left >= list.right - 1 || panels.right <= list.left + 1,
      below: panels.top >= list.bottom - 1,
      listWidth: list.width,
    };
  });
}

test.describe("vertical tabs keep the list beside the panel until the room is short", () => {
  for (const width of [320, 375, 768, 1280]) {
    test(`at ${String(width)}px and 100% text the list is beside the panel`, async ({ page }) => {
      await open(page, width);
      expect((await arrangement(page)).beside).toBe(true);
    });
  }

  for (const width of [640, 768]) {
    test(`at ${String(width)}px with the browser's text at 200% the list is beside the panel`, async ({
      page,
    }) => {
      await open(page, width);
      await setBrowserTextSize(page, 200);
      await settleFrames(page);
      expect((await arrangement(page)).beside).toBe(true);
    });
  }

  for (const width of [320, 600, 639]) {
    test(`at ${String(width)}px with the browser's text at 200% the list is above the panel`, async ({
      page,
    }) => {
      await open(page, width);
      await setBrowserTextSize(page, 200);
      await settleFrames(page);
      expect((await arrangement(page)).below).toBe(true);
    });
  }

  test("drawn above the panel, the list still runs top to bottom for the arrow keys", async ({
    page,
  }) => {
    await open(page, 320);
    await setBrowserTextSize(page, 200);
    await settleFrames(page);
    expect((await arrangement(page)).below).toBe(true);
    // Whatever way it is drawn, a vertical tablist is announced as vertical and moves by Up and
    // Down; drawn across, Left and Right move along it too.
    const tabs = page.locator("#tabs-vertical");
    await expect(tabs.locator('[role="tablist"]')).toHaveAttribute("aria-orientation", "vertical");
    await page.locator("#vertical-profile").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#vertical-security")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#vertical-alerts")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#vertical-security")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#vertical-profile")).toBeFocused();
  });

  test("in right-to-left text Left moves on along a vertical list drawn across, and Right back", async ({
    page,
  }) => {
    await open(page, 320);
    await setBrowserTextSize(page, 200);
    await page.locator("#tabs-vertical").evaluate((tabs) => {
      tabs.setAttribute("dir", "rtl");
    });
    await settleFrames(page);
    expect((await arrangement(page)).below).toBe(true);
    await page.locator("#vertical-profile").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#vertical-security")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#vertical-profile")).toBeFocused();
  });
});

// The list is as wide as two fifths of the tabs, as it always was, but not so narrow that a tab
// crosses its border onto the panel: in brutalist, whose border is thick and whose labels are
// capitals, a 375px window at 100% text once had the Security tab 3px past the list's border, and
// 10px in a wider face.
test.describe("a vertical tab stays inside its list's border at 100% text", () => {
  for (const wide of [false, true]) {
    test(`brutalist at 375px, ${wide ? "wide" : "default"} text`, async ({ page }) => {
      await open(page, 375);
      await setTextSize(page, { label: "100%", fontSize: "100%", wide });
      await applyAxes(page, { design: "brutalist" });
      const past = await page.evaluate(() => {
        const host = document.querySelector("#tabs-vertical");
        const list = host?.shadowRoot?.querySelector(".list")?.getBoundingClientRect();
        if (!host || !list) throw new Error("no list");
        return [...host.querySelectorAll("idg-tab")].flatMap((tab) => {
          const box = tab.shadowRoot?.querySelector(".tab")?.getBoundingClientRect();
          if (!box) throw new Error("no tab");
          return box.right > list.right + 0.5
            ? [`${tab.textContent.trim()} ${String(Math.round(box.right - list.right))}px`]
            : [];
        });
      });
      expect(past).toEqual([]);
    });
  }
});

test("Up and Down do nothing in a horizontal list, whatever its width", async ({ page }) => {
  await open(page, 320);
  await setBrowserTextSize(page, 200);
  await page.locator("#tab-overview").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#tab-overview")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#tab-overview")).toBeFocused();
});

// Where a parent is as wide as what it holds (an inline block, a float, a track sized by its
// content), vertical tabs are as wide as their list, the gap and their panel's content, as they
// always were: they are not a container with a width of their own.
test.describe("vertical tabs in a parent sized by its content are as wide as what they hold", () => {
  const CONTEXTS = [
    ["an inline block", "display: inline-block"],
    ["a float", "float: left"],
    ["a max-content grid track", "display: grid; grid-template-columns: max-content"],
    ["an absolutely positioned box", "position: absolute"],
  ] as const;
  for (const [name, style] of CONTEXTS) {
    for (const width of [320, 1280]) {
      test(`in ${name} at ${String(width)}px and 100% text`, async ({ page }) => {
        await open(page, width);
        const found = await page.evaluate(async (rule) => {
          const parent = document.createElement("div");
          parent.style.cssText = rule;
          const tabs = document.createElement("idg-tabs");
          tabs.setAttribute("orientation", "vertical");
          tabs.setAttribute("label", "Letters");
          for (const [value, label, text] of [
            ["a", "A", "Hi"],
            ["b", "B", "Yo"],
          ] as const) {
            const tab = document.createElement("idg-tab");
            tab.setAttribute("value", value);
            tab.textContent = label;
            const panel = document.createElement("idg-tab-panel");
            panel.setAttribute("value", value);
            panel.textContent = text;
            tabs.append(tab, panel);
          }
          parent.append(tabs);
          document.body.prepend(parent);
          await customElements.whenDefined("idg-tabs");
          await new Promise((resolve) => setTimeout(resolve, 200));
          const list = tabs.shadowRoot?.querySelector(".list")?.getBoundingClientRect();
          const panels = tabs.shadowRoot?.querySelector(".panels")?.getBoundingClientRect();
          const inner = tabs.shadowRoot?.querySelector(".tabs");
          if (!list || !panels || !inner) throw new Error("no list or panels");
          const gap = Number.parseFloat(getComputedStyle(inner).columnGap);
          return {
            host: tabs.getBoundingClientRect().width,
            list: list.width,
            gap,
            panels: panels.width,
            beside: panels.left >= list.right - 1,
          };
        }, style);
        expect(found.beside).toBe(true);
        expect(found.host).toBeCloseTo(found.list + found.gap + found.panels, 0);
        // Two one-letter tabs and a word: a list and a panel of a few dozen pixels each.
        expect(found.panels).toBeLessThan(80);
        expect(found.host).toBeLessThan(320);
      });
    }
  }
});

test("a tab says which way its list runs, and a vertical tab's label starts at the list's start", async ({
  page,
}) => {
  await open(page, 1280);
  const found = await page.evaluate(() => {
    const read = (selector: string) => {
      const tab = document.querySelector(selector);
      const label = tab?.shadowRoot?.querySelector(".tab");
      if (!tab || !label) throw new Error(`no ${selector}`);
      return {
        attribute: tab.getAttribute("orientation"),
        justify: getComputedStyle(label).justifyContent,
      };
    };
    return { vertical: read("#vertical-profile"), horizontal: read("#tab-overview") };
  });
  expect(found.vertical).toEqual({ attribute: "vertical", justify: "flex-start" });
  expect(found.horizontal.attribute).toBe("horizontal");
});

test("at 320px with the browser's text at 200% every horizontal tab is inside the window, in every design, in the wide face", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await open(page, 320);
  await setBrowserTextSize(page, 200);
  await setTextSize(page, { label: "200%", fontSize: "100%", wide: true });
  const failures: string[] = [];
  for (const design of DESIGNS) {
    await applyAxes(page, { design });
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll("idg-tabs:not(#tabs-vertical) idg-tab")]
        .filter(
          (tab) => tab.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
        )
        .map((tab) => tab.id),
    );
    if (outside.length > 0) failures.push(`${design}: ${outside.join(", ")}`);
  }
  expect(failures).toEqual([]);
});

/** Builds tabs of the given labels, each a list of nodes, in a parent of the given style. */
async function placeTabs(page: Page, style: string, labels: readonly (readonly string[])[]) {
  await page.evaluate(
    async ({ rule, tabs }) => {
      document.querySelector("#placed")?.remove();
      const parent = document.createElement("div");
      parent.id = "placed";
      parent.style.cssText = rule;
      const host = document.createElement("idg-tabs");
      host.setAttribute("label", "Placed");
      tabs.forEach((parts, index) => {
        const tab = document.createElement("idg-tab");
        tab.setAttribute("value", String(index));
        for (const part of parts) {
          if (part === "<icon>") {
            const icon = document.createElement("img");
            icon.src = "/fixtures/avatar.svg";
            icon.width = 24;
            icon.height = 24;
            icon.alt = "";
            tab.append(icon);
          } else if (part.startsWith("<badge>")) {
            const badge = document.createElement("idg-badge");
            badge.textContent = part.slice("<badge>".length);
            tab.append(badge);
          } else tab.append(part);
        }
        const panel = document.createElement("idg-tab-panel");
        panel.setAttribute("value", String(index));
        panel.textContent = "Panel";
        host.append(tab, panel);
      });
      parent.append(host);
      document.body.prepend(parent);
      await customElements.whenDefined("idg-tabs");
      await Promise.all([...parent.querySelectorAll("img")].map((image) => image.decode()));
    },
    { rule: style, tabs: labels },
  );
  await hydrated(page);
  await settleFrames(page);
}

// A word wider than a tab in a narrow column breaks inside the tab, whose label may be narrower
// than its longest word, and does not stand out on both sides of it.
test("a word wider than a tab in a narrow column stays inside the tab, in every design", async ({
  page,
}) => {
  await open(page, 1280);
  await placeTabs(page, "inline-size: 60px", [
    ["Internationalisation settings"],
    ["Notifications"],
  ]);
  const failures: string[] = [];
  for (const design of DESIGNS) {
    await applyAxes(page, { design });
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll("#placed idg-tab")].flatMap((tab) => {
        const box = tab.shadowRoot?.querySelector(".tab")?.getBoundingClientRect();
        if (!box) throw new Error("no tab");
        const range = document.createRange();
        range.selectNodeContents(tab);
        return [...range.getClientRects()]
          .filter(
            (line) =>
              line.width > 0 && (line.left < box.left - 0.5 || line.right > box.right + 0.5),
          )
          .map(() => tab.textContent.trim());
      }),
    );
    if (outside.length > 0) failures.push(`${design}: ${[...new Set(outside)].join(", ")}`);
  }
  expect(failures).toEqual([]);
});

// What a tab holds is laid out as it always was, as items in a row centred across the tab with the
// tab's gap between them: an icon beside a word, a word beside a badge. The reference puts them
// back in the tab's own row, as they were before the tab had a label element.
test.describe("a tab holding an icon or a badge lays them out as it did", () => {
  for (const width of [375, 1280]) {
    test(`at ${String(width)}px, in every design`, async ({ page }) => {
      await open(page, width);
      await page.evaluate(() => {
        const gap = new CSSStyleSheet();
        gap.replaceSync("#placed idg-tab::part(tab) { gap: 12px; }");
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, gap];
      });
      await placeTabs(page, "", [["<icon>", "Inbox"], ["Sent ", "<badge>3"], ["Plain"]]);
      const layout = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("#placed idg-tab")].map((tab) => {
            const box = tab.shadowRoot?.querySelector(".tab")?.getBoundingClientRect();
            if (!box) throw new Error("no tab");
            const parts = [...tab.childNodes].flatMap((node) => {
              const range = document.createRange();
              range.selectNodeContents(node);
              const part =
                node instanceof Element
                  ? node.getBoundingClientRect()
                  : range.getBoundingClientRect();
              return part.width > 0
                ? [
                    [part.left - box.left, part.top - box.top, part.width, part.height]
                      .map((n) => Math.round(n * 2) / 2)
                      .join(","),
                  ]
                : [];
            });
            return `${(Math.round(box.width * 2) / 2).toString()}x${(Math.round(box.height * 2) / 2).toString()} ${parts.join(" ")}`;
          }),
        );
      const failures: string[] = [];
      for (const design of DESIGNS) {
        await applyAxes(page, { design });
        const found = await layout();
        await page.evaluate(() => {
          for (const tab of document.querySelectorAll("#placed idg-tab")) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(".label { display: contents; }");
            if (tab.shadowRoot)
              tab.shadowRoot.adoptedStyleSheets = [...tab.shadowRoot.adoptedStyleSheets, sheet];
          }
        });
        await settleFrames(page);
        const expected = await layout();
        await page.evaluate(() => {
          for (const tab of document.querySelectorAll("#placed idg-tab")) {
            if (tab.shadowRoot)
              tab.shadowRoot.adoptedStyleSheets = tab.shadowRoot.adoptedStyleSheets.slice(0, -1);
          }
        });
        found.forEach((tab, index) => {
          if (tab !== expected[index])
            failures.push(`${design}: ${tab}, was ${String(expected[index])}`);
        });
      }
      expect(failures).toEqual([]);
    });
  }
});
