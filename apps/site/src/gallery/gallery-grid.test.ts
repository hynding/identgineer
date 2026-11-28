import { describe, expect, it } from "vitest";
import { GRID_STEPS, columnsFor, gridCss } from "./gallery-grid.ts";

/** The tiles left in the last row when `count` tiles are set `columns` to a row. */
function lastRow(count: number, columns: number): number {
  return count % columns === 0 ? columns : count % columns;
}

describe("the columns of a gallery's tiles", () => {
  it.each([
    [8, 4, 4],
    [8, 3, 2],
    [9, 4, 3],
    [6, 4, 3],
    [7, 4, 4],
    [5, 4, 3],
    [8, 1, 1],
  ])("for %i tiles where %i fit are %i", (count, fit, expected) => {
    expect(columnsFor(count, fit)).toBe(expected);
  });

  it("never leave a last row of one tile where another count of columns avoids it", () => {
    for (let count = 2; count <= 40; count += 1) {
      for (let fit = 1; fit <= 4; fit += 1) {
        const columns = columnsFor(count, fit);
        expect(columns).toBeGreaterThanOrEqual(1);
        expect(columns).toBeLessThanOrEqual(fit);
        if (columns > 1)
          expect(lastRow(count, columns), `${String(count)} in ${String(fit)}`).toBeGreaterThan(1);
      }
    }
  });

  it("are written as rules for every count, one for each width the grid steps at", () => {
    const css = gridCss(24);
    expect(css).toContain('.gallery-tiles[data-count="9"]');
    for (const { minimum } of GRID_STEPS)
      expect(css).toContain(`(min-inline-size: ${String(minimum)}em)`);
    const nine = css.split("\n").filter((line) => line.includes('data-count="9"'));
    expect(nine.join("\n")).toContain("repeat(3,");
  });
});
