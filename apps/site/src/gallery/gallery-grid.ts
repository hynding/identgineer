/**
 * The widths, in em of the gallery's text, at which its tiles take another column, and how many
 * columns fit from there. A container query cannot read a token, so the widths are written out in
 * em, which follow the type scale: 31em holds two tiles of 15em and their gap.
 */
export const GRID_STEPS = [
  { minimum: 31, fit: 2 },
  { minimum: 47, fit: 3 },
  { minimum: 63, fit: 4 },
] as const;

/**
 * How many columns to set `count` tiles in where `fit` would fit: the most that fill every row, if
 * there are enough of them to be worth it, and otherwise the most that leave no row of a single
 * tile. Eight tiles are four to a row or two, never three; nine are three, never four and one.
 */
export function columnsFor(count: number, fit: number): number {
  const divisors = Array.from({ length: fit }, (_, index) => fit - index).filter(
    (columns) => columns > 1 && count % columns === 0 && columns * 2 >= fit,
  );
  const full = divisors[0];
  if (full !== undefined) return full;
  const unorphaned = Array.from({ length: fit }, (_, index) => fit - index).find(
    (columns) => count % columns !== 1,
  );
  return unorphaned ?? 1;
}

/**
 * The rules that set each tile list's columns from its own count, for every count up to `largest`:
 * a list says how many tiles it holds, and the grid is chosen for that number at each width, so
 * a value added to a registry needs no rule written for it.
 */
export function gridCss(largest: number): string {
  return GRID_STEPS.map(({ minimum, fit }) => {
    const rules = Array.from({ length: largest }, (_, index) => index + 1).map(
      (count) =>
        `  .gallery-tiles[data-count="${String(count)}"] { grid-template-columns: repeat(${String(columnsFor(count, fit))}, minmax(0, 1fr)); }`,
    );
    return `@container gallery (min-inline-size: ${String(minimum)}em) {\n${rules.join("\n")}\n}`;
  }).join("\n");
}
