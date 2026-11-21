import { parseHexColor } from "./contrast.ts";
import type { ResolvedToken } from "./token-types.ts";
import { isGradientStopArray } from "./token-types.ts";

/** Throws, naming the file and token, when a colour (or gradient stop colour) is not `#rrggbb`. */
export function assertValidColors(tokens: readonly ResolvedToken[]): void {
  for (const token of tokens) {
    const where = `token "${token.path}" in ${token.source}`;
    if (token.type === "color" && typeof token.value === "string") {
      parseHexColor(token.value, where);
    } else if (token.type === "gradient" && isGradientStopArray(token.value)) {
      for (const stop of token.value) parseHexColor(stop.color, where);
    }
  }
}
