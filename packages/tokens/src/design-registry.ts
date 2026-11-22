import { DESIGN_IDS, type DesignId } from "./design-ids.ts";
import { DESIGN_SOURCES } from "./design-sources.ts";
import { buildModeRegistry, type ModeDefinition } from "./mode-registry.ts";
import { parseMode } from "./parse-mode.ts";

export interface DesignDefinition extends ModeDefinition<DesignId> {
  /** False for a design whose identity is its corners: a brand theme's radii never apply to it. */
  readonly followsBrandCorners: boolean;
}

function isDesignId(id: string): id is DesignId {
  return DESIGN_IDS.some((known) => known === id);
}

const FOLLOWS_BRAND_CORNERS = new Map(
  DESIGN_SOURCES.map((source) => [source.id, parseMode(source, "design").followsBrandCorners]),
);

export const DESIGNS: readonly DesignDefinition[] = buildModeRegistry(
  DESIGN_SOURCES,
  "design",
  isDesignId,
).map((definition) => ({
  ...definition,
  followsBrandCorners: FOLLOWS_BRAND_CORNERS.get(definition.id) === true,
}));
