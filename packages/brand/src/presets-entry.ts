// The choices a brand kit makes from (font pairings, corner radii, corner styles, tones) as an entry
// of their own: they are plain data, and the package index also loads the theme pipeline. A page
// that shows a kit imports `@identgineer/brand/presets` and gets them without the generator.
export { CORNERS, TONES } from "./brand-kit.ts";
export { CORNER_RADII, RADIUS_NAMES } from "./corner-radii.ts";
export { FONT_PAIRINGS, TYPOGRAPHY_IDS } from "./font-pairings.ts";
