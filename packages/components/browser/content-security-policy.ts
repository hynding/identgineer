/**
 * The strictest policy the library is meant to run under. Every browser test is served with it,
 * so a stylesheet, script or sink that needs a looser policy fails the suite.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'";
