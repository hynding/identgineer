import type { Page } from "@playwright/test";
import { applyAxes, LAYOUTS, UX_MODES } from "./axes";
import { expect, test } from "./fixtures";
import { frames, openShell } from "./layout-shell-page";

type Arrangement = "same-row" | "stacked" | "no-toggle";

/** Where the brand and the menu button sit at 100% text, as the shell has always drawn them. */
const HEADER: Record<string, Record<number, Arrangement>> = {
  bento: { 320: "same-row", 360: "same-row", 390: "same-row", 768: "same-row", 1280: "no-toggle" },
  centered: { 320: "stacked", 360: "stacked", 390: "stacked", 768: "no-toggle", 1280: "no-toggle" },
  dashboard: {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "no-toggle",
    1280: "no-toggle",
  },
  immersive: {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "same-row",
    1280: "same-row",
  },
  magazine: { 320: "stacked", 360: "stacked", 390: "stacked", 768: "no-toggle", 1280: "no-toggle" },
  "side-rail": {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "no-toggle",
    1280: "no-toggle",
  },
  "split-hero": {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "same-row",
    1280: "same-row",
  },
  "top-bar": {
    320: "same-row",
    360: "same-row",
    390: "same-row",
    768: "same-row",
    1280: "no-toggle",
  },
};

function arrangement(page: Page): Promise<Arrangement> {
  return page.locator("#shell").evaluate((host): Arrangement => {
    const brand = host.shadowRoot?.querySelector<HTMLElement>('[part="brand"]');
    const toggle = host.shadowRoot?.querySelector<HTMLElement>('[part="toggle"]');
    if (!brand || !toggle) throw new Error("no brand or toggle");
    if (!toggle.checkVisibility()) return "no-toggle";
    const a = brand.getBoundingClientRect();
    const b = toggle.getBoundingClientRect();
    return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 ? "same-row" : "stacked";
  });
}

test.describe("the header at ordinary sizes is arranged as it always was", () => {
  for (const layout of LAYOUTS) {
    test(`${layout}: brand and menu button share a row, or stack, or the button is gone, at 320px to 1280px`, async ({
      page,
    }) => {
      await openShell(page, { layout });
      const expected = HEADER[layout];
      if (!expected) throw new Error(`no expectation for ${layout}`);
      for (const [width, want] of Object.entries(expected)) {
        await page.setViewportSize({ width: Number(width), height: 800 });
        await frames(page, 3);
        expect(await arrangement(page), `${layout} at ${width}px`).toBe(want);
      }
    });
  }
});

test.describe("a card is padded as the tokens say, and only a narrow card gives up padding", () => {
  for (const width of [320, 390, 768, 1280]) {
    test(`at ${String(width)}px the inline padding of every card region follows the rule, in every layout and UX mode`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await openShell(page, { width });
      const failures: string[] = [];
      for (const layout of LAYOUTS) {
        for (const ux of UX_MODES) {
          await applyAxes(page, { layout, ux });
          await frames(page, 2);
          const found = await page.evaluate(() => {
            // Every value is computed from the tokens the card itself reads: its padding is the
            // density's, unless the card is so narrow that the text would be left less than the
            // minimum width, when the padding gives way down to the floor.
            const lengthOf = (value: string): number => {
              const probe = document.createElement("div");
              probe.style.paddingInlineStart = value;
              document.body.append(probe);
              const pixels = Number.parseFloat(getComputedStyle(probe).paddingInlineStart);
              probe.remove();
              return pixels;
            };
            const pad = lengthOf("calc(var(--idg-space-m) * var(--idg-density-gap-scale))");
            const floor = lengthOf("var(--idg-space-2xs)");
            const minimum = lengthOf("var(--idg-size-xs)");
            const seen: { padding: number; expected: number }[] = [];
            for (const card of document.querySelectorAll("idg-card")) {
              const box = card.shadowRoot?.querySelector<HTMLElement>('[part="card"]');
              if (!box) continue;
              const style = getComputedStyle(box);
              const room =
                box.getBoundingClientRect().width -
                Number.parseFloat(style.borderInlineStartWidth) -
                Number.parseFloat(style.borderInlineEndWidth);
              const expected = Math.min(pad, Math.max(floor, (room - minimum) / 2));
              for (const part of ["header", "body"]) {
                const region = card.shadowRoot?.querySelector(`[part="${part}"]`);
                if (region) {
                  const padding = Number.parseFloat(getComputedStyle(region).paddingInlineStart);
                  seen.push({ padding, expected });
                }
              }
            }
            return seen;
          });
          if (found.length === 0) failures.push(`${layout} / ${ux}: no card regions`);
          for (const { padding, expected } of found) {
            if (Math.abs(padding - expected) > 0.1) {
              failures.push(`${layout} / ${ux}: ${String(padding)}px, not ${String(expected)}px`);
              break;
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

test.describe("a card keeps the words that fit its text whole", () => {
  /**
   * The pieces of the text in the cards (a word, or the part of one up to a hyphen) that run over
   * more than one line although they are no wider than the room the card's rule leaves the text.
   * A piece wider than that may break: nothing else would hold it.
   */
  const brokenWords = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
      const lengthOf = (value: string): number => {
        const probe = document.createElement("div");
        probe.style.paddingInlineStart = value;
        document.body.append(probe);
        const pixels = Number.parseFloat(getComputedStyle(probe).paddingInlineStart);
        probe.remove();
        return pixels;
      };
      const pad = lengthOf("calc(var(--idg-space-m) * var(--idg-density-gap-scale))");
      const floor = lengthOf("var(--idg-space-2xs)");
      const minimum = lengthOf("var(--idg-size-xs)");
      const measure = document.createElement("canvas").getContext("2d");
      if (!measure) throw new Error("no canvas");
      // The card's borders and the measuring of a string are not exact, so a piece must fit with a little to spare.
      const EDGE = 6;
      const found: string[] = [];
      for (const card of document.querySelectorAll("idg-card")) {
        const box = card.shadowRoot?.querySelector<HTMLElement>('[part="card"]');
        if (!box) continue;
        const style = getComputedStyle(box);
        const width =
          box.getBoundingClientRect().width -
          Number.parseFloat(style.borderInlineStartWidth) -
          Number.parseFloat(style.borderInlineEndWidth);
        const room = width - 2 * Math.min(pad, Math.max(floor, (width - minimum) / 2));
        const walk = (node: Node): void => {
          if (node instanceof Text) {
            const parent = node.parentElement;
            if (!parent?.checkVisibility()) return;
            const text = getComputedStyle(parent);
            measure.font = `${text.fontWeight} ${text.fontSize} ${text.fontFamily}`;
            const spacing = Number.parseFloat(text.letterSpacing) || 0;
            for (const piece of node.data.matchAll(/[^\s-]+-?/g)) {
              const natural = measure.measureText(piece[0]).width + spacing * piece[0].length;
              const range = document.createRange();
              range.setStart(node, piece.index);
              range.setEnd(node, piece.index + piece[0].length);
              const lines = new Set([...range.getClientRects()].map((box) => Math.round(box.top)));
              if (lines.size > 1 && natural + EDGE <= room) found.push(piece[0]);
            }
            return;
          }
          node.childNodes.forEach(walk);
        };
        walk(card);
      }
      return found;
    });

  for (const [width, layout, design, ux] of [
    [768, "dashboard", "pixel", "focus"],
    [1280, "dashboard", "pixel", "focus"],
    [1280, "dashboard", "flat", "comfortable"],
    [390, "top-bar", "flat", "comfortable"],
  ] as const) {
    test(`${layout} / ${design} / ${ux} at ${String(width)}px: no word that fits a card's text is broken inside`, async ({
      page,
    }) => {
      await openShell(page, { width });
      await applyAxes(page, { layout, ux });
      await page.evaluate((value) => {
        document.documentElement.dataset.design = value;
      }, design);
      await frames(page, 3);
      expect(await brokenWords(page)).toEqual([]);
    });
  }
});

/** The cells of the tables on the page whose text breaks inside a word, one line each. */
function brokenCells(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const cell of document.querySelectorAll("idg-table th, idg-table td")) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const lines = new Set([...range.getClientRects()].map((box) => Math.round(box.top)));
      const words = cell.textContent.trim().split(/\s+/).length;
      if (lines.size > words) found.push(`${cell.textContent.trim()}: ${String(lines.size)} lines`);
    }
    return found;
  });
}

test.describe("a table keeps its columns", () => {
  for (const [width, fontSize] of [
    [390, "100%"],
    [320, "200%"],
  ] as const) {
    test(`at ${String(width)}px with text at ${fontSize} no cell of a table in a card breaks inside a word`, async ({
      page,
    }) => {
      await openShell(page, { width, fontSize, layout: "top-bar", ux: "focus" });
      await page.evaluate(() => {
        const table = document.querySelector("idg-table");
        const card = document.createElement("idg-card");
        card.setAttribute("heading", "Activity");
        table?.replaceWith(card);
        if (table) card.append(table);
      });
      await frames(page, 3);
      expect(await brokenCells(page)).toEqual([]);
    });
  }

  test("at 390px the fixture's own table keeps its columns in every layout and UX mode", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openShell(page, { width: 390 });
    const failures: string[] = [];
    for (const layout of LAYOUTS) {
      for (const ux of UX_MODES) {
        await applyAxes(page, { layout, ux });
        await frames(page, 2);
        const broken = await brokenCells(page);
        if (broken.length > 0) failures.push(`${layout} / ${ux}: ${broken.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
