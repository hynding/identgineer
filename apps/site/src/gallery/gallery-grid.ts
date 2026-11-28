/**
 * The widths, in em of the gallery's text, at which its tiles take another column, and how many
 * columns fit from there. A container query cannot read a token, so the widths are written out in
 * em, which follow the type scale: 26em holds two tiles of 12em and their gap.
 */
export const GRID_STEPS = [
  { minimum: 26, fit: 2 },
  { minimum: 40, fit: 3 },
  { minimum: 54, fit: 4 },
] as const;

/**
 * How many columns to set `count` tiles in where `fit` would fit: all of them, where that fills
 * every row; one fewer where that does, on a grid of four or more (six tiles are three and three,
 * not four and two); and otherwise as many as leave no last row of a single tile. Eight tiles are
 * four to a row, or three and three and two; nine are three, never four and one.
 */
export function columnsFor(count: number, fit: number): number {
  if (count % fit === 0) return fit;
  const fewer = fit - 1;
  if (fit >= 4 && count % fewer === 0) return fewer;
  const roomy = Array.from({ length: fit }, (_, index) => fit - index);
  return roomy.find((columns) => count % columns !== 1) ?? 1;
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
