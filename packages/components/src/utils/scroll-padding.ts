let holders = 0;
let sheet: CSSStyleSheet | undefined;

/**
 * Keeps a focused element clear of chrome pinned to the top of the viewport. The browser scrolls a
 * focused element into view without knowing a sticky bar covers the first rows of the page, so the
 * page's own scroller is padded by the layout's `--idg-layout-sticky-inset`, which is `0` for a
 * layout that pins nothing. The rule is adopted as a constructable stylesheet, which `style-src`
 * does not govern, and calls are counted so the sheet stays while any shell is on the page.
 */
export function reserveScrollPadding(document: Document): void {
  holders += 1;
  if (holders > 1 || typeof CSSStyleSheet === "undefined") return;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(":root { scroll-padding-block-start: var(--idg-layout-sticky-inset); }");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export function releaseScrollPadding(document: Document): void {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || sheet === undefined) return;
  const added = sheet;
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((other) => other !== added);
  sheet = undefined;
}
