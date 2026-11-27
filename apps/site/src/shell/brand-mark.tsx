import { h } from "@stencil/core";

/**
 * The site's mark: a person on a tile. Its colours and corners are set by the site's stylesheet from
 * the tokens, so it takes on the theme and the design's radius like everything else.
 */
export function BrandMark() {
  return (
    <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect class="brand-mark-tile" x="1" y="1" width="30" height="30" />
      <circle class="brand-mark-glyph" cx="16" cy="12.5" r="4.5" />
      <path class="brand-mark-glyph" d="M7 26a9 8 0 0 1 18 0z" />
      <circle class="brand-mark-spark" cx="24.5" cy="7.5" r="2" />
    </svg>
  );
}
