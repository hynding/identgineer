import type { SharedSource } from "./build-token-files.ts";
import type { ThemeSource } from "./parse-theme.ts";
import { THEME_IDS } from "./theme-ids.ts";
import design from "./tokens/design.json" with { type: "json" };
import layout from "./tokens/layout.json" with { type: "json" };
import primitive from "./tokens/primitive.json" with { type: "json" };
import semantic from "./tokens/semantic.json" with { type: "json" };
import aurora from "./tokens/themes/aurora.json" with { type: "json" };
import citrus from "./tokens/themes/citrus.json" with { type: "json" };
import ember from "./tokens/themes/ember.json" with { type: "json" };
import graphite from "./tokens/themes/graphite.json" with { type: "json" };
import orchid from "./tokens/themes/orchid.json" with { type: "json" };
import paper from "./tokens/themes/paper.json" with { type: "json" };
import terminal from "./tokens/themes/terminal.json" with { type: "json" };
import tidal from "./tokens/themes/tidal.json" with { type: "json" };
import ux from "./tokens/ux.json" with { type: "json" };

/** The default roles each axis owns; every theme, design, layout and UX mode must redefine all of them. */
export const ROLE_SOURCES = {
  theme: { file: "tokens/semantic.json", json: semantic },
  design: { file: "tokens/design.json", json: design },
  layout: { file: "tokens/layout.json", json: layout },
  ux: { file: "tokens/ux.json", json: ux },
} as const satisfies Record<string, SharedSource>;

/** Cascade order: later documents override earlier ones. */
export const SHARED_SOURCES: readonly SharedSource[] = [
  { file: "tokens/primitive.json", json: primitive },
  ROLE_SOURCES.theme,
  ROLE_SOURCES.design,
  ROLE_SOURCES.layout,
  ROLE_SOURCES.ux,
];

const THEME_DOCUMENTS = { aurora, ember, tidal, graphite, citrus, orchid, terminal, paper };

export const THEME_SOURCES: readonly ThemeSource[] = THEME_IDS.map((id) => ({
  id,
  file: `tokens/themes/${id}.json`,
  json: THEME_DOCUMENTS[id],
}));
