import { createHash } from "node:crypto";

/**
 * The text of every `<style>` element of a rendered page, including those in declarative shadow
 * roots. Stencil's serialiser writes CSS that never holds `</style>`, so the text ends at the first.
 */
export function inlineStyles(html: string): string[] {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1] ?? "");
}

/** The CSP source that allows exactly this inline style. */
export function styleSource(css: string): string {
  return `'sha256-${createHash("sha256").update(css, "utf8").digest("base64")}'`;
}

/**
 * The policy every page is served with. Scripts and stylesheets come from the site's own origin;
 * the only inline content is the components' styles in their declarative shadow roots, each
 * allowed by its hash. Nothing else may load, and Trusted Types are required, with no policy of the
 * page's own allowed, since neither the components nor the bootstrap script write HTML as a string.
 */
export function contentSecurityPolicy(styles: readonly string[]): string {
  const hashes = [...new Set(styles.map(styleSource))].sort();
  return [
    "default-src 'none'",
    "script-src 'self'",
    ["style-src 'self'", ...hashes].join(" "),
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ].join("; ");
}

/**
 * Every header a deployment sends with every response of the site. Only features that browsers
 * know are named in the permissions policy: an unknown one is logged as an error in the console.
 */
export function securityHeaders(policy: string): Readonly<Record<string, string>> {
  return {
    "Content-Security-Policy": policy,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}
