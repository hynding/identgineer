const LENGTH = /^\d+(?:\.\d+)?(?:px|rem|em|ch|vh|svh|dvh|vw|%)$/;

/**
 * A length from an attribute that is safe to put in a custom property. Only a plain number with a
 * unit passes, so a value cannot carry a second declaration, a url or a function.
 */
export function safeCssLength(value: string | undefined): string | undefined {
  return value !== undefined && LENGTH.test(value) ? value : undefined;
}
