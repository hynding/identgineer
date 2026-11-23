import { contrastRatio } from "./contrast.ts";
import type { ResolvedToken } from "./token-types.ts";

const PAGE_BACKGROUNDS = ["bg", "bg-subtle", "surface", "surface-raised"];
const NO_EDGE = "transparent";

function colorsByRole(tokens: readonly ResolvedToken[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const token of tokens) {
    if (token.type === "color" && typeof token.value === "string") {
      colors.set(token.path.replace(/^color\./, ""), token.value);
    }
  }
  return colors;
}

/**
 * Adds `color.accent-edge`, the edge to draw over an accent fill: no edge at all where the accent
 * already reaches 3:1 against every page background, otherwise `accent-border`. Drawing the
 * accent itself over the fill would still darken its anti-aliased corners, so a theme whose
 * accent stands out paints nothing and renders exactly as before. Derived, never authored: a
 * theme sets `accent-border`, and the edge follows from it.
 */
export function withAccentEdge(tokens: readonly ResolvedToken[]): ResolvedToken[] {
  const colors = colorsByRole(tokens);
  const accent = colors.get("accent");
  const border = colors.get("accent-border");
  if (accent === undefined || border === undefined) return [...tokens];
  const standsOut = PAGE_BACKGROUNDS.every((role) => {
    const background = colors.get(role);
    return background !== undefined && contrastRatio(accent, background) >= 3;
  });
  const source = tokens.find((token) => token.path === "color.accent-border")?.source ?? "";
  return [
    ...tokens,
    {
      path: "color.accent-edge",
      type: "color",
      value: standsOut ? NO_EDGE : border,
      description: undefined,
      source,
    },
  ];
}
