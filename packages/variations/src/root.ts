/** An element, or a document whose root element is used. */
export type VariationsRoot = Element | Document;

/**
 * The global document is only consulted here, at call time, so importing the package never
 * touches the DOM and a server (no `document`) simply gets no root.
 */
export function resolveRoot(root?: VariationsRoot): Element | undefined {
  const candidate = root ?? (globalThis as { document?: Document }).document;
  if (!candidate) return undefined;
  return "documentElement" in candidate ? candidate.documentElement : candidate;
}
