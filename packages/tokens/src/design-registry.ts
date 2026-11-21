import { DESIGN_IDS, type DesignId } from "./design-ids.ts";
import { DESIGN_SOURCES } from "./design-sources.ts";
import { buildModeRegistry, type ModeDefinition } from "./mode-registry.ts";

export type DesignDefinition = ModeDefinition<DesignId>;

function isDesignId(id: string): id is DesignId {
  return DESIGN_IDS.some((known) => known === id);
}

export const DESIGNS: readonly DesignDefinition[] = buildModeRegistry(
  DESIGN_SOURCES,
  "design",
  isDesignId,
);
