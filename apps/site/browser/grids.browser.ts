import { expect, test } from "./fixtures";
import { LAYOUTS, hydrated } from "./pages";

/** A phone, a tablet, a small laptop and three desktop windows. */
const GRID_WIDTHS = [390, 820, 1024, 1280, 1440, 1920] as const;

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
