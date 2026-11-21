import type { TokenSources } from "./build-token-files.ts";
import { DEFAULT_DESIGN_ID } from "./design-ids.ts";
import { DESIGN_SOURCES } from "./design-sources.ts";
import preferences from "./tokens/preferences.json" with { type: "json" };
import { DEFAULT_LAYOUT_ID } from "./layout-ids.ts";
import { LAYOUT_SOURCES } from "./layout-sources.ts";
import { DEFAULT_THEME_ID } from "./theme-ids.ts";
import { SHARED_SOURCES, THEME_SOURCES } from "./theme-sources.ts";
import { DEFAULT_UX_MODE_ID } from "./ux-ids.ts";
import { UX_MODE_SOURCES } from "./ux-sources.ts";

export const TOKEN_SOURCES: TokenSources = {
  shared: SHARED_SOURCES,
  themes: THEME_SOURCES,
  designs: DESIGN_SOURCES,
  layouts: LAYOUT_SOURCES,
  uxModes: UX_MODE_SOURCES,
  preferences: { file: "tokens/preferences.json", json: preferences },
  defaultThemeId: DEFAULT_THEME_ID,
  defaultDesignId: DEFAULT_DESIGN_ID,
  defaultLayoutId: DEFAULT_LAYOUT_ID,
  defaultUxModeId: DEFAULT_UX_MODE_ID,
};
