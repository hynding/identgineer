// Emitting a theme in the browser: the emitters as an entry of their own. They load the theme
// generator, the logo sanitiser it validates a kit with and the tokens package's emitter and its
// JSON token sources, all of which are plain modules, so a page can emit the artefacts of a theme
// itself. `emit-entry.test.ts` holds that this graph names no package but the tokens package and
// reads nothing from the disk.
export { emitBrandTheme, emitBrandThemeCss, emitBrandThemeTokens } from "./emit-brand-theme.ts";
