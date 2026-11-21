import { LAYOUT_IDS, type LayoutId } from "./layout-ids.ts";
import { LAYOUT_SOURCES } from "./layout-sources.ts";
import { buildModeRegistry, type ModeDefinition } from "./mode-registry.ts";

export type LayoutDefinition = ModeDefinition<LayoutId>;

function isLayoutId(id: string): id is LayoutId {
  return LAYOUT_IDS.some((known) => known === id);
}

export const LAYOUTS: readonly LayoutDefinition[] = buildModeRegistry(
  LAYOUT_SOURCES,
  "layout",
  isLayoutId,
);
