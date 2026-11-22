const CHROME = 'idg-layout > :is([slot="brand"], [slot="navigation"], [slot="actions"])';

const TEXT_ENTRY =
  "input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset]), textarea, [contenteditable]:not([contenteditable=false])";
const TEXT_COMPONENTS = "idg-input, idg-textarea";
const TEXT_FOCUSED = [
  `${CHROME}:is(${TEXT_ENTRY}):focus`,
  `${CHROME} :is(${TEXT_ENTRY}):focus`,
  `${CHROME}:is(${TEXT_COMPONENTS}):focus-within`,
  `${CHROME} :is(${TEXT_COMPONENTS}):focus-within`,
].join(", ");

// Chrome applies the padding to a focused element inside the pinned bar itself and, finding it "too
// near the top", scrolls the page to the top. So the bar's own regions cancel the padding for what
// they hold, through a property that inherits into the shadow roots of idg- controls, which read it
// in their own sheets. A script that scrolls a target into view while the bar has focus still lands
// it under the bar, because the padding stays on for everything else. Chrome's reveal of an editable
// element ignores scroll-margin and takes the root padding, so that padding is dropped, and only,
// while text entry in the bar has focus.
export const SCROLL_PADDING_RULES = [
  ":root { scroll-padding-block-start: var(--idg-layout-sticky-inset); }",
  `${CHROME} { --_idg-chrome-scroll-margin: calc(-1 * var(--idg-layout-sticky-inset)); }`,
  `${CHROME}, ${CHROME} * { scroll-margin-block-start: var(--_idg-chrome-scroll-margin, 0px); }`,
  `:root:has(${TEXT_FOCUSED}) { scroll-padding-block-start: 0; }`,
].join("\n");

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
  sheet.replaceSync(SCROLL_PADDING_RULES);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export function releaseScrollPadding(document: Document): void {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || sheet === undefined) return;
  const added = sheet;
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((other) => other !== added);
  sheet = undefined;
}
