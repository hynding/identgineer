import type { Page } from "@playwright/test";
import { DESIGNS, UX_MODES, applyAxes } from "./axes";
import { expect, test } from "./fixtures";
import { hydrated, settleFrames } from "./reflow";
import { withoutCalcSize } from "./without-calc-size";

// A page may let the words of a region break anywhere, so that no long word in it ever leaves it
// (idg-layout's hero does), and that is inherited by every component placed there. A figure or a
// button's label is read whole, so neither takes it up: in a parent sized by its content, where an
// inherited break anywhere would make the content as narrow as a letter, each is still as wide as
// its longest word. In a row narrower than the label's longest word, in a window with room, the
// button keeps the word whole and reaches past the row, as a button's smallest size allows, and so
// does a full-width button (the sign-in and consent forms' kind) in a column narrower than a word.
//
// An engine without `calc-size()`, with which the stat and the button set their smallest size,
// must keep the words whole too, so each case is also run with it taken out of the styles.

const FIGURE = "12,480";
const LABEL = "Surprise me";
const FULL_WIDTH_LABEL = "Open the appearance panel";

/**
 * Places a stat and a button in a column as narrow as its content, a button in a row and a
 * full-width button in a narrow column, all where words break anywhere.
 */
async function placeInBreakAnywhereColumn(page: Page): Promise<void> {
  await page.evaluate(
    ({ figure, label, fullWidthLabel }) => {
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
      // A row as narrow as the button's label less a little, sized once the button is drawn.
      const row = document.createElement("div");
      row.id = "whole-words-row";
      row.style.display = "flex";
      row.style.overflowWrap = "anywhere";
      const narrow = document.createElement("idg-button");
      narrow.textContent = label;
      row.append(narrow);
      // A column of 120px, narrower than "appearance" at any type size, with a full-width button.
      const narrowColumn = document.createElement("div");
      narrowColumn.id = "whole-words-full-width";
      narrowColumn.style.inlineSize = "120px";
      narrowColumn.style.overflowWrap = "anywhere";
      const fullWidth = document.createElement("idg-button");
      fullWidth.setAttribute("full-width", "");
      fullWidth.textContent = fullWidthLabel;
      narrowColumn.append(fullWidth);
      column.append(stat, button);
      document.body.prepend(column, row, narrowColumn);
    },
    { figure: FIGURE, label: LABEL, fullWidthLabel: FULL_WIDTH_LABEL },
  );
  await hydrated(page);
  await settleFrames(page);
}

/** Sets the row 8px narrower than the button in the column, which is as wide as its longest word. */
async function narrowRow(page: Page): Promise<void> {
  await settleFrames(page);
  await page.evaluate(() => {
    const row = document.getElementById("whole-words-row");
    const word = document.querySelector("#whole-words idg-button")?.getBoundingClientRect().width;
    if (!row || word === undefined) throw new Error("the row or the button is missing");
    row.style.inlineSize = `${String(Math.round(word) - 8)}px`;
  });
  await settleFrames(page);
}

/** The words of the stat's figure and of the button's label that sit on more than one line. */
function brokenWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const column = document.getElementById("whole-words");
    const texts = [
      column?.querySelector("idg-stat")?.shadowRoot?.querySelector('[part="value"]'),
      column?.querySelector("idg-button"),
      document.querySelector("#whole-words-row idg-button"),
      document.querySelector("#whole-words-full-width idg-button"),
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
  for (const engine of ["with calc-size()", "without calc-size()"] as const) {
    test(`in a column as narrow as its content and a row narrower than the label, in every design and UX mode, ${engine}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/fixtures/surfaces.html");
      await hydrated(page);
      await placeInBreakAnywhereColumn(page);
      if (engine === "without calc-size()") {
        expect(await withoutCalcSize(page), "calc-size() taken out").toBeGreaterThan(0);
      }
      const failures: string[] = [];
      for (const design of DESIGNS) {
        for (const ux of UX_MODES) {
          await applyAxes(page, { design, ux });
          await narrowRow(page);
          const broken = await brokenWords(page);
          if (broken.length > 0) failures.push(`${design}/${ux}: ${broken.join(", ")}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }
});
