/** An element, or a document whose root element is used. */
export type VariationsRoot = Element | Document;

/**
 * The global document is only consulted when no root was given, and only at call time, so
 * importing the package never touches the DOM and a server (no `document`) simply gets no root.
 * A document that was given but has no root element resolves to nothing: it never falls back to
 * the global document, which would apply a choice to a page the caller did not name.
 */
export function resolveRoot(root?: VariationsRoot): Element | undefined {
  const candidate = root ?? (globalThis as { document?: Document }).document;
  if (!candidate) return undefined;
  if (!("documentElement" in candidate)) return candidate;
  // A document can lack a root element although the DOM types say it cannot.
  const element: Element | null = candidate.documentElement;
  return element ?? undefined;
}
