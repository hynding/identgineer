export interface StyleRoot {
  adoptedStyleSheets: CSSStyleSheet[];
}

export function adoptStyles(root: StyleRoot, sheet: CSSStyleSheet): () => void {
  root.adoptedStyleSheets = [sheet];
  return () => undefined;
}
