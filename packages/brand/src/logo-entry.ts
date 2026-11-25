// The two functions a page needs to draw a logo, as an entry of their own: the package index also
// loads the theme pipeline, which reads the tokens sources from disk and so cannot be bundled for a
// browser. A component that shows a logo imports `@identgineer/brand/logo` and gets the sanitiser
// check and nothing of the theme generator.
export { isSanitisedSvgLogo } from "./is-sanitised-svg-logo.ts";
export { logoDataUrl } from "./logo-data-url.ts";
