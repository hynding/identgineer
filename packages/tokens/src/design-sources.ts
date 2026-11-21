import type { ModeSource } from "./parse-mode.ts";
import { DESIGN_IDS } from "./design-ids.ts";
import brutalist from "./tokens/designs/brutalist.json" with { type: "json" };
import editorial from "./tokens/designs/editorial.json" with { type: "json" };
import elevated from "./tokens/designs/elevated.json" with { type: "json" };
import flat from "./tokens/designs/flat.json" with { type: "json" };
import glass from "./tokens/designs/glass.json" with { type: "json" };
import outline from "./tokens/designs/outline.json" with { type: "json" };
import pixel from "./tokens/designs/pixel.json" with { type: "json" };
import soft from "./tokens/designs/soft.json" with { type: "json" };

const DESIGN_DOCUMENTS = { flat, soft, glass, brutalist, outline, elevated, pixel, editorial };

export const DESIGN_SOURCES: readonly ModeSource[] = DESIGN_IDS.map((id) => ({
  id,
  file: `tokens/designs/${id}.json`,
  json: DESIGN_DOCUMENTS[id],
}));
