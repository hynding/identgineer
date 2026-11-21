import type { ModeSource } from "./parse-mode.ts";
import { UX_MODE_IDS } from "./ux-ids.ts";
import calm from "./tokens/ux/calm.json" with { type: "json" };
import comfortable from "./tokens/ux/comfortable.json" with { type: "json" };
import compact from "./tokens/ux/compact.json" with { type: "json" };
import focus from "./tokens/ux/focus.json" with { type: "json" };
import guided from "./tokens/ux/guided.json" with { type: "json" };
import playful from "./tokens/ux/playful.json" with { type: "json" };
import power from "./tokens/ux/power.json" with { type: "json" };
import spacious from "./tokens/ux/spacious.json" with { type: "json" };

const UX_MODE_DOCUMENTS = { comfortable, compact, spacious, playful, calm, focus, guided, power };

export const UX_MODE_SOURCES: readonly ModeSource[] = UX_MODE_IDS.map((id) => ({
  id,
  file: `tokens/ux/${id}.json`,
  json: UX_MODE_DOCUMENTS[id],
}));
