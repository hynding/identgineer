const SAME_CONTEXT_TARGET = "_self";
const HARDENING_TOKENS = ["noopener", "noreferrer"] as const;

/**
 * A link that opens another browsing context must not hand it `window.opener` or the referrer,
 * whatever `rel` the author wrote. Returns the `rel` to render.
 */
export function linkRel(target: string | undefined, rel: string | undefined): string | undefined {
  if (target === undefined || target === "" || target.toLowerCase() === SAME_CONTEXT_TARGET) {
    return rel;
  }
  const authored = (rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return [...new Set([...authored, ...HARDENING_TOKENS])].join(" ");
}
