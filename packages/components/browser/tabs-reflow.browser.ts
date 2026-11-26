import type { Page } from "@playwright/test";
import { DESIGNS, applyAxes } from "./axes";
import { expect, test } from "./fixtures";
import { hydrated, settleFrames } from "./reflow";
import { setTextSize } from "./text-size";

const PAGE = "/fixtures/navigation.html";

async function open(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(PAGE);
  await hydrated(page);
}

/** Every word of the vertical tabs' labels and of the panel shown, and the room each has. */
function wordsAndRoom(page: Page) {
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
    for (const tab of tabs.querySelectorAll("idg-tab")) {
      const label = tab.shadowRoot?.querySelector(".tab");
      if (!label) throw new Error("no tab label");
      const style = getComputedStyle(label);
      const room =
        label.getBoundingClientRect().width -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight) -
        2 * Number.parseFloat(style.borderLeftWidth);
      check(`tab ${tab.textContent.trim()}`, tab.textContent.trim(), style, room);
    }
    for (const paragraph of tabs.querySelectorAll("idg-tab-panel p")) {
      if (!paragraph.checkVisibility()) continue;
      const style = getComputedStyle(paragraph);
      check("panel", paragraph.textContent, style, paragraph.getBoundingClientRect().width);
    }
    return broken;
  });
}

test.describe("vertical tabs keep their words whole with text at 200%", () => {
  for (const width of [320, 480, 600]) {
    for (const wide of [false, true]) {
      test(`at ${String(width)}px, ${wide ? "wide" : "default"} text, in every design`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await open(page, width);
        await setTextSize(page, { label: "200%", fontSize: "200%", wide });
        const failures: string[] = [];
        for (const design of DESIGNS) {
          await applyAxes(page, { design });
          failures.push(...(await wordsAndRoom(page)).map((word) => `${design}: ${word}`));
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
  for (const width of [375, 768, 1280]) {
    test(`at ${String(width)}px and 100% text the list is beside the panel`, async ({ page }) => {
      await open(page, width);
      expect((await arrangement(page)).beside).toBe(true);
    });
  }

  test("at 320px and 200% text the list is above the panel, and the list still runs top to bottom for the arrow keys", async ({
    page,
  }) => {
    await open(page, 320);
    await setTextSize(page, { label: "200%", fontSize: "200%", wide: false });
    await settleFrames(page);
    expect((await arrangement(page)).below).toBe(true);
    // Whatever way it is drawn, a vertical tablist is announced as vertical and moves by Up and Down.
    const tabs = page.locator("#tabs-vertical");
    await expect(tabs.locator('[role="tablist"]')).toHaveAttribute("aria-orientation", "vertical");
    await page.locator("#vertical-profile").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#vertical-security")).toBeFocused();
  });
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

test("at 320px and 200% text every horizontal tab is inside the window, in every design, in the wide face", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await open(page, 320);
  await setTextSize(page, { label: "200%", fontSize: "200%", wide: true });
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
