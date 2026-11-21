import { buildModeRegistry, type ModeDefinition } from "./mode-registry.ts";
import { UX_MODE_IDS, type UxModeId } from "./ux-ids.ts";
import { UX_MODE_SOURCES } from "./ux-sources.ts";

export type UxModeDefinition = ModeDefinition<UxModeId>;

function isUxModeId(id: string): id is UxModeId {
  return UX_MODE_IDS.some((known) => known === id);
}

export const UX_MODES: readonly UxModeDefinition[] = buildModeRegistry(
  UX_MODE_SOURCES,
  "ux",
  isUxModeId,
);
