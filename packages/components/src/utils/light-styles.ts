export interface StyleRoot {
  adoptedStyleSheets: CSSStyleSheet[];
}

const users = new WeakMap<StyleRoot, Map<CSSStyleSheet, number>>();

/**
 * Adds a stylesheet to a document or shadow root until every user of it has let go. Some components
 * style elements the page supplies, such as a native table, which their own shadow root cannot
 * reach, so they adopt a constructable sheet into the tree the elements live in. Sheets are
 * counted, so two components sharing one sheet do not take it from each other, and CSSOM
 * adoption needs no `<style>` element, which a strict CSP forbids.
 */
export function adoptStyles(root: StyleRoot, sheet: CSSStyleSheet): () => void {
  const counts = users.get(root) ?? new Map<CSSStyleSheet, number>();
  users.set(root, counts);
  const count = counts.get(sheet) ?? 0;
  counts.set(sheet, count + 1);
  if (count === 0) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (counts.get(sheet) ?? 1) - 1;
    if (remaining > 0) {
      counts.set(sheet, remaining);
      return;
    }
    counts.delete(sheet);
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter((adopted) => adopted !== sheet);
  };
}

/** A constructable sheet, or undefined in a browser or test environment that has none. */
export function createSheet(css: string): CSSStyleSheet | undefined {
  if (typeof CSSStyleSheet === "undefined") return undefined;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  } catch {
    return undefined;
  }
}
