const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto", "tel"]);

// Browsers drop tabs and newlines inside a url and read a backslash as a slash, so a value
// containing either is parsed differently from how it looks. Refusing them removes the ambiguity.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const SCHEME = /^([^:/?#]*):/;

/**
 * Returns the url when it is safe to put in an `href`, otherwise `undefined`.
 * Only http, https, mailto, tel and relative urls pass. Anything that would be parsed with a
 * different scheme than the one it appears to have is refused rather than repaired.
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (typeof url !== "string" || url === "") return undefined;
  if (url !== url.trim() || CONTROL_CHARACTER.test(url) || url.includes("\\")) return undefined;

  const scheme = SCHEME.exec(url)?.[1];
  if (scheme === undefined) return url;
  return ALLOWED_SCHEMES.has(scheme.toLowerCase()) ? url : undefined;
}
