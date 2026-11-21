import { createSheet } from "../../utils/light-styles";

/**
 * Styles for the native table an idg-table wraps. The cells belong to the page, so no rule in the
 * component's own shadow root can reach them. The rules are adopted into the tree the table is in,
 * scoped to `idg-table`, and put in a layer, which any unlayered rule of the page overrides.
 *
 * It is a string rather than a stylesheet file because the build bundles a component's own
 * stylesheet into its shadow root, and this one has to be available as text. The same check that
 * holds every shipped stylesheet to --idg-* tokens runs over it in its test.
 */
export const TABLE_LIGHT_CSS = `@layer idg.components {
  idg-table > table {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: var(--_min-width, 0px);
    border-collapse: separate;
    border-spacing: 0;
    color: var(--idg-color-text);
    font-family: var(--idg-font-family-body);
    font-size: calc(var(--idg-font-size-step-0) * var(--idg-ux-type-scale));
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--idg-font-body-letter-spacing);
    line-height: var(--idg-font-body-line-height);
    text-align: start;
  }

  idg-table > table > caption {
    padding-block: calc(var(--idg-space-s) * var(--idg-density-gap-scale));
    padding-inline: calc(var(--idg-space-s) * var(--idg-density-gap-scale));
    caption-side: top;
    color: var(--idg-color-text);
    font-family: var(--idg-font-family-display);
    font-size: calc(var(--idg-font-size-step-1) * var(--idg-ux-type-scale));
    font-weight: var(--idg-font-display-weight);
    letter-spacing: var(--idg-font-display-letter-spacing);
    line-height: var(--idg-font-display-line-height);
    text-align: start;
    text-transform: var(--idg-ornament-heading-transform);
  }

  /* A row is at least the design's target size tall, and its padding follows the UX mode's density. */
  idg-table > table > * > tr > :is(th, td) {
    box-sizing: border-box;
    block-size: var(--idg-density-target-size);
    padding-block: calc(var(--idg-space-xs) * var(--idg-density-gap-scale));
    padding-inline: calc(var(--idg-space-s) * var(--idg-density-gap-scale));
    border-block-end-width: var(--idg-border-width);
    border-block-end-style: var(--idg-border-style);
    border-block-end-color: var(--idg-border-color);
    text-align: start;
    vertical-align: middle;
  }

  idg-table > table > tbody > tr:last-child > :is(th, td) {
    border-block-end-width: 0;
  }

  /* The header is drawn as the design draws a heading, on an opaque fill so rows scrolling under a
     sticky header do not show through it. */
  idg-table > table > thead > tr > th {
    border-block-end-width: max(var(--idg-border-width), 1px);
    border-block-end-style: solid;
    border-block-end-color: var(--idg-color-border-strong);
    background: var(--idg-color-bg-subtle);
    color: var(--idg-color-text);
    font-family: var(--idg-font-family-display);
    font-weight: var(--idg-font-weight-semibold);
    letter-spacing: var(--idg-font-letter-spacing-wide);
    text-transform: var(--idg-ornament-heading-transform);
  }

  idg-table > table > tbody > tr > th {
    font-weight: var(--idg-font-weight-semibold);
  }

  /* A design with no borders (soft, elevated) would leave the rows with nothing between them. */
  @container style(--idg-border-style: none) {
    idg-table > table > tbody > tr:not(:last-child) > :is(th, td) {
      box-shadow: inset 0 -1px 0 var(--idg-color-border);
    }
  }

  idg-table[striped] > table > tbody > tr:nth-child(even) {
    background: var(--idg-color-bg-subtle);
  }

  idg-table > table > tbody > tr:hover > :is(th, td) {
    background: var(--idg-color-accent-subtle);
    color: var(--idg-color-on-accent-subtle);
  }

  idg-table[sticky-header] > table > thead > tr > th {
    position: sticky;
    inset-block-start: 0;
    z-index: 1;
  }

  /* The sort button fills the header cell and is at least the design's target size. */
  idg-table .idg-table-sort {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: calc(var(--idg-space-2xs) * var(--idg-density-gap-scale));
    min-block-size: var(--idg-density-target-size);
    min-inline-size: var(--idg-density-target-size);
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--idg-shape-radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    letter-spacing: inherit;
    text-align: start;
    text-transform: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  idg-table .idg-table-sort:hover {
    text-decoration-line: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 0.2em;
  }

  /* The ring sits inside the button, so the scroll area around the table cannot clip it. */
  idg-table .idg-table-sort:focus-visible {
    outline-width: calc(var(--idg-focus-ring-width) * var(--idg-focus-emphasis));
    outline-style: var(--idg-focus-ring-style);
    outline-color: var(--idg-color-focus-ring);
    outline-offset: calc(-1 * var(--idg-focus-ring-width) * var(--idg-focus-emphasis));
  }

  /* Two small triangles, the one for the sorted direction filled. They are drawn rather than
     written so that nothing is added to the button's name. */
  idg-table .idg-table-sort-mark {
    position: relative;
    flex: none;
    inline-size: 0.7em;
    block-size: 1em;
  }

  idg-table .idg-table-sort-mark::before,
  idg-table .idg-table-sort-mark::after {
    content: "";
    position: absolute;
    inset-inline: 0;
    block-size: 0.4em;
    background: currentcolor;
    opacity: 0.4;
  }

  idg-table .idg-table-sort-mark::before {
    inset-block-start: 0.05em;
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
  }

  idg-table .idg-table-sort-mark::after {
    inset-block-end: 0.05em;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
  }

  idg-table th[aria-sort="ascending"] .idg-table-sort-mark::before,
  idg-table th[aria-sort="descending"] .idg-table-sort-mark::after {
    opacity: 1;
  }

  @media (forced-colors: active) {
    idg-table > table > * > tr > :is(th, td) {
      border-block-end: 1px solid CanvasText;
    }

    idg-table > table > thead > tr > th {
      background: Canvas;
      color: CanvasText;
    }

    idg-table > table > tbody > tr:hover > :is(th, td) {
      forced-color-adjust: none;
      background: Highlight;
      color: HighlightText;
    }

    idg-table .idg-table-sort-mark::before,
    idg-table .idg-table-sort-mark::after {
      forced-color-adjust: none;
      background: CanvasText;
    }
  }
}
`;

let sheet: CSSStyleSheet | undefined;

/** The shared sheet, made on first use, or undefined where constructable stylesheets do not exist. */
export function tableSheet(): CSSStyleSheet | undefined {
  sheet ??= createSheet(TABLE_LIGHT_CSS);
  return sheet;
}
