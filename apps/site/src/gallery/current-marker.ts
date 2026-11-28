import type { GallerySection } from "./gallery-records.ts";

const TILE = ".gallery-tile";

/**
 * The rules that mark each axis's current tile, written from the root's own attribute, so the mark
 * is right as soon as the stylesheet is: the bootstrap script has set the attribute before the
 * first paint, and a script that draws the page afterwards need not move anything. A value is
 * current where the root names it; the default is current where the root names no value at all.
 *
 * A tile's mark is its outline and the label "Current" that the stylesheet hides, so a tile is
 * never marked by colour alone. Ids are checked to be plain lower-case words when the records are
 * made, so they are written into selectors as they are.
 */
export function currentMarkerCss(sections: readonly GallerySection[]): string {
  return sections
    .flatMap(({ axis, attribute, tiles }) =>
      tiles.flatMap(({ id, isDefault }) => {
        const tile = `${TILE}[data-axis="${axis}"][data-value="${id}"]`;
        const roots = [
          `:root[${attribute}="${id}"]`,
          ...(isDefault ? [`:root:not([${attribute}])`] : []),
        ];
        const within = (suffix: string) =>
          roots.map((root) => `${root} ${tile}${suffix}`).join(", ");
        return [
          `${within("")} { outline: var(--idg-focus-ring-width) solid var(--idg-color-accent-indicator); outline-offset: var(--idg-space-3xs); }`,
          `${within(" .tile-current")} { display: inline-block; }`,
        ];
      }),
    )
    .join("\n");
}
