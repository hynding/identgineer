import type { ModeSource } from "./parse-mode.ts";
import { LAYOUT_IDS } from "./layout-ids.ts";
import bento from "./tokens/layouts/bento.json" with { type: "json" };
import centered from "./tokens/layouts/centered.json" with { type: "json" };
import dashboard from "./tokens/layouts/dashboard.json" with { type: "json" };
import immersive from "./tokens/layouts/immersive.json" with { type: "json" };
import magazine from "./tokens/layouts/magazine.json" with { type: "json" };
import sideRail from "./tokens/layouts/side-rail.json" with { type: "json" };
import splitHero from "./tokens/layouts/split-hero.json" with { type: "json" };
import topBar from "./tokens/layouts/top-bar.json" with { type: "json" };

const LAYOUT_DOCUMENTS = {
  "top-bar": topBar,
  "side-rail": sideRail,
  "split-hero": splitHero,
  magazine,
  dashboard,
  centered,
  bento,
  immersive,
};

export const LAYOUT_SOURCES: readonly ModeSource[] = LAYOUT_IDS.map((id) => ({
  id,
  file: `tokens/layouts/${id}.json`,
  json: LAYOUT_DOCUMENTS[id],
}));
