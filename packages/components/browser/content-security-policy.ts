/**
 * The strictest policy the library is meant to run under. Every browser test is served with it,
 * so a stylesheet, script or sink that needs a looser policy fails the suite.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'";

/**
 * The strict policy with one directive added: images may come from data URLs, which is what a page
 * that shows logos through `logoDataUrl` must allow (and all the brand package's README asks of it).
 */
export const LOGO_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY.replace(
  "default-src 'self';",
  "default-src 'self'; img-src 'self' data:;",
);
