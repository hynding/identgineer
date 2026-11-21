import type { SharedSource, TokenSources } from "./build-token-files.ts";
import type { ThemeSource } from "./parse-theme.ts";
import { DEFAULT_THEME_ID, THEME_IDS } from "./theme-ids.ts";
import density from "./tokens/density.json" with { type: "json" };
import elevation from "./tokens/elevation.json" with { type: "json" };
import motion from "./tokens/motion.json" with { type: "json" };
import primitive from "./tokens/primitive.json" with { type: "json" };
import semantic from "./tokens/semantic.json" with { type: "json" };
import shape from "./tokens/shape.json" with { type: "json" };
import aurora from "./tokens/themes/aurora.json" with { type: "json" };
import citrus from "./tokens/themes/citrus.json" with { type: "json" };
import ember from "./tokens/themes/ember.json" with { type: "json" };
import graphite from "./tokens/themes/graphite.json" with { type: "json" };
import orchid from "./tokens/themes/orchid.json" with { type: "json" };
import paper from "./tokens/themes/paper.json" with { type: "json" };
import terminal from "./tokens/themes/terminal.json" with { type: "json" };
import tidal from "./tokens/themes/tidal.json" with { type: "json" };

/** Cascade order: later documents override earlier ones. */
export const SHARED_SOURCES: readonly SharedSource[] = [
  { file: "tokens/primitive.json", json: primitive },
  { file: "tokens/semantic.json", json: semantic },
  { file: "tokens/shape.json", json: shape },
  { file: "tokens/elevation.json", json: elevation },
  { file: "tokens/density.json", json: density },
  { file: "tokens/motion.json", json: motion },
];

const THEME_DOCUMENTS = { aurora, ember, tidal, graphite, citrus, orchid, terminal, paper };

export const THEME_SOURCES: readonly ThemeSource[] = THEME_IDS.map((id) => ({
  id,
  file: `tokens/themes/${id}.json`,
  json: THEME_DOCUMENTS[id],
}));

export const TOKEN_SOURCES: TokenSources = {
  shared: SHARED_SOURCES,
  themes: THEME_SOURCES,
  defaultThemeId: DEFAULT_THEME_ID,
};
