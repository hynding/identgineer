let holders = 0;
let sheet: CSSStyleSheet | undefined;

/**
 * Stops the page scrolling behind a modal dialog, without a layout shift. A modal makes the page
 * inert but the wheel and touch still scroll it. The rule is adopted as a constructable stylesheet,
 * which `style-src` does not govern, so no inline style is written. The scrollbar's gutter is kept
 * only when the page had a scrollbar, otherwise reserving it would itself shift the layout. Calls
 * are counted, so nested dialogs unlock only when the last one closes.
 */
export function lockScroll(document: Document): void {
  holders += 1;
  if (holders > 1 || typeof CSSStyleSheet === "undefined") return;
  const root = document.documentElement;
  const window = document.defaultView;
  const hadScrollbar = window !== null && window.innerWidth - root.clientWidth > 0;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(
    `:root { overflow: hidden; ${hadScrollbar ? "scrollbar-gutter: stable;" : ""} }`,
  );
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

export function unlockScroll(document: Document): void {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || sheet === undefined) return;
  const added = sheet;
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((other) => other !== added);
  sheet = undefined;
}
