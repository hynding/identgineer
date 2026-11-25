// What a page that edits a kit needs, as an entry of its own: reading a draft with `parseBrandKit`,
// a theme for its preview with `generateBrandTheme`, and an upload through `sanitiseSvgLogo`, with
// the limits they hold input to. The package index also loads the store and the emitters, which an
// editor calls through the store it is given or not at all. `edit-entry.test.ts` holds that this
// graph names no package but the tokens package and reads nothing from the disk.
export { generateBrandTheme } from "./generate-brand-theme.ts";
export { NAME_MAX_LENGTH, parseBrandKit, TAGLINE_MAX_LENGTH } from "./parse-brand-kit.ts";
export { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
export { SVG_LOGO_LIMITS } from "./svg-logo-limits.ts";
