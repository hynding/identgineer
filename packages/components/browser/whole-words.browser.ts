import type { Page } from "@playwright/test";
import { DESIGNS, UX_MODES, applyAxes } from "./axes";
import { expect, test } from "./fixtures";
import { hydrated, settleFrames } from "./reflow";

// A page may let the words of a region break anywhere, so that no long word in it ever leaves it
// (idg-layout's hero does), and that is inherited by every component placed there. A figure or a
// button's label is read whole, so neither takes it up: in a parent sized by its content, where an
// inherited break anywhere would make the content as narrow as a letter, each is still as wide as
// its longest word.

const FIGURE = "12,480";
const LABEL = "Surprise me";

/** Places a stat and a button in a column as narrow as its content, whose words break anywhere. */
async function placeInBreakAnywhereColumn(page: Page): Promise<void> {
  await page.evaluate(
    ({ figure, label }) => {
      document.getElementById("whole-words")?.remove();
      const column = document.createElement("div");
      column.id = "whole-words";
      column.style.display = "grid";
      column.style.gridTemplateColumns = "min-content";
      column.style.gap = "16px";
      column.style.overflowWrap = "anywhere";
      const stat = document.createElement("idg-stat");
      stat.setAttribute("label", "Visitors");
      stat.setAttribute("value", figure);
      const button = document.createElement("idg-button");
      button.textContent = label;
      column.append(stat, button);
      document.body.prepend(column);
    },
    { figure: FIGURE, label: LABEL },
  );
  await hydrated(page);
  await settleFrames(page);
}

/** The words of the stat's figure and of the button's label that sit on more than one line. */
function brokenWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const column = document.getElementById("whole-words");
    const texts = [
      column?.querySelector("idg-stat")?.shadowRoot?.querySelector('[part="value"]'),
      column?.querySelector("idg-button"),
    ];
    const broken: string[] = [];
    for (const holder of texts) {
      if (!holder) throw new Error("the stat or the button is missing");
      const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (const word of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const tops = new Set(
            [...range.getClientRects()]
              .filter((line) => line.width > 0)
              .map((line) => Math.round(line.top)),
          );
          if (tops.size > 1) broken.push(word[0]);
        }
      }
    }
    return broken;
  });
}

test.describe("a figure and a button label keep their words whole where the page breaks words anywhere", () => {
  test("in a column as narrow as its content, in every design and UX mode", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/fixtures/surfaces.html");
    await hydrated(page);
    await placeInBreakAnywhereColumn(page);
    const failures: string[] = [];
    for (const design of DESIGNS) {
      for (const ux of UX_MODES) {
        await applyAxes(page, { design, ux });
        await settleFrames(page);
        const broken = await brokenWords(page);
        if (broken.length > 0) failures.push(`${design}/${ux}: ${broken.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
