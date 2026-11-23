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

test.describe("a card is padded as the tokens say at ordinary sizes", () => {
  for (const width of [390, 768, 1280]) {
    test(`at ${String(width)}px the inline padding of every card region is the density's, in every layout and UX mode`, async ({
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
            // The expected value is computed from the tokens the card itself reads.
            const probe = document.createElement("div");
            probe.style.paddingInlineStart =
              "calc(var(--idg-space-m) * var(--idg-density-gap-scale))";
            document.body.append(probe);
            const expected = Number.parseFloat(getComputedStyle(probe).paddingInlineStart);
            probe.remove();
            const seen: number[] = [];
            for (const card of document.querySelectorAll("idg-card")) {
              for (const part of ["header", "body"]) {
                const region = card.shadowRoot?.querySelector(`[part="${part}"]`);
                if (region)
                  seen.push(Number.parseFloat(getComputedStyle(region).paddingInlineStart));
              }
            }
            return { expected, seen };
          });
          if (found.seen.length === 0) failures.push(`${layout} / ${ux}: no card regions`);
          for (const padding of found.seen) {
            if (Math.abs(padding - found.expected) > 0.1) {
              failures.push(
                `${layout} / ${ux}: ${String(padding)}px, not ${String(found.expected)}px`,
              );
              break;
            }
          }
        }
      }
      expect(failures).toEqual([]);
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
