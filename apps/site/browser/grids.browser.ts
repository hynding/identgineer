import { expect, test } from "./fixtures";
import { LAYOUTS, hydrated } from "./pages";

/** A phone, a tablet, a small laptop and four desktop windows, the widest a 1440p screen's. */
const GRID_WIDTHS = [390, 820, 1024, 1280, 1440, 1920, 2560] as const;

/** The home page's grids of cards and tiles, each of which is meant to have no empty cell. */
const GRIDS = [".next-cards", ".themes", ".axes"] as const;

// A grid of cards with an empty cell at the end of a row reads as a card missing. In each layout,
// in the default look, at each width, every row of the pages to come, the theme tiles and the axes
// reaches from the grid's start to its end.
for (const layout of LAYOUTS) {
  test(`${layout}: every row of the home page's card and tile grids is full`, async ({ page }) => {
    const problems: string[] = [];
    for (const width of GRID_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?idg-layout=${layout}`);
      await hydrated(page, "site-home");
      const short = await page.evaluate((selectors) => {
        const found: string[] = [];
        for (const selector of selectors) {
          const grid = document.querySelector<HTMLElement>(selector);
          if (!grid) {
            found.push(`${selector} is missing`);
            continue;
          }
          const box = grid.getBoundingClientRect();
          const style = getComputedStyle(grid);
          const start = box.left + Number.parseFloat(style.paddingLeft);
          const end = box.right - Number.parseFloat(style.paddingRight);
          const rows = new Map<number, { left: number; right: number }>();
          for (const item of grid.children) {
            const itemBox = item.getBoundingClientRect();
            const top = Math.round(itemBox.top);
            const row = rows.get(top) ?? { left: Infinity, right: -Infinity };
            rows.set(top, {
              left: Math.min(row.left, itemBox.left),
              right: Math.max(row.right, itemBox.right),
            });
          }
          [...rows.values()].forEach(({ left, right }, index) => {
            const gap = Math.max(left - start, end - right);
            if (gap > 1) {
              found.push(
                `${selector} row ${String(index + 1)} of ${String(rows.size)} is ${String(Math.round(gap))}px short`,
              );
            }
          });
        }
        return found;
      }, GRIDS);
      for (const problem of short) problems.push(`${String(width)}px: ${problem}`);
    }
    expect(problems).toEqual([]);
  });
}

// Where the pages to come have four columns, the overview takes two of them, so that with the six
// cards after it both rows are full. Two layouts reach four columns in the default look: the
// dashboard from 1920px and the side rail at 2560px.
for (const [layout, width] of [
  ["dashboard", 1920],
  ["side-rail", 2560],
] as const) {
  test(`${layout} at ${String(width)}px: the overview spans two of the four columns`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?idg-layout=${layout}`);
    await hydrated(page, "site-home");
    const { columns, overview, first } = await page.evaluate(() => {
      const grid = document.querySelector(".next-cards");
      const cards = [...(grid?.children ?? [])];
      return {
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
        overview: cards[0]?.classList.contains("next-overview") ?? false,
        first: getComputedStyle(cards[0] ?? document.body).gridColumnStart,
      };
    });
    expect(columns).toBe(4);
    expect(overview).toBe(true);
    expect(first).toBe("span 2");
  });
}

// The theme tiles set the sample's letters in each theme's own face, some wider than others. Every
// tile keeps the same room for them, so the swatches sit beside the letters in every tile of a row
// or under them in every one, and no tile of a row is taller than the rest.
for (const layout of LAYOUTS) {
  test(`${layout}: the theme tiles of a row are alike`, async ({ page }) => {
    const problems: string[] = [];
    for (const width of GRID_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?idg-layout=${layout}`);
      await hydrated(page, "site-home");
      const uneven = await page.evaluate(() => {
        const rows = new Map<number, { theme: string; under: boolean; height: number }[]>();
        for (const tile of document.querySelectorAll<HTMLElement>(".theme-tile")) {
          const box = tile.getBoundingClientRect();
          const sample = tile.querySelector(".theme-sample");
          const text = sample
            ? document.createTreeWalker(sample, NodeFilter.SHOW_TEXT).nextNode()
            : null;
          const range = document.createRange();
          if (text) range.selectNodeContents(text);
          const letters = text ? range.getBoundingClientRect() : undefined;
          const swatches = tile.querySelector(".theme-swatches")?.getBoundingClientRect();
          const under =
            letters !== undefined && swatches !== undefined && swatches.top >= letters.bottom - 1;
          const row = rows.get(Math.round(box.top)) ?? [];
          row.push({ theme: tile.dataset.theme ?? "", under, height: Math.round(box.height) });
          rows.set(Math.round(box.top), row);
        }
        return [...rows.values()].flatMap((row, index) => {
          const first = row[0];
          return row
            .filter((tile) => tile.under !== first?.under || tile.height !== first.height)
            .map(
              (tile) =>
                `row ${String(index + 1)}: ${tile.theme} ${tile.under ? "under" : "beside"}, ${String(tile.height)}px against ${first?.theme ?? ""}'s ${String(first?.height)}px`,
            );
        });
      });
      for (const problem of uneven) problems.push(`${String(width)}px: ${problem}`);
    }
    expect(problems).toEqual([]);
  });
}
