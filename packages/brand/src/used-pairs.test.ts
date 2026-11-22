import {
  flattenTokens,
  mergeTokens,
  parseTheme,
  resolveThemeScheme,
  SHARED_SOURCES,
  THEME_SOURCES,
} from "@identgineer/tokens/theme-pipeline";
import { describe, expect, it } from "vitest";
import { BUILT_IN_PAIRS, failingUsedPairs } from "./used-pairs.ts";

const shared = mergeTokens(...SHARED_SOURCES.map(({ file, json }) => flattenTokens(file, json)));

function colorsOf(source: (typeof THEME_SOURCES)[number], scheme: "light" | "dark") {
  const colors = new Map<string, string>();
  for (const token of resolveThemeScheme(shared, parseTheme(source), scheme)) {
    if (token.type === "color" && typeof token.value === "string") {
      colors.set(token.path.replace(/^color\./, ""), token.value);
    }
  }
  return colors;
}

const BUILT_IN = THEME_SOURCES.flatMap((source) =>
  (["light", "dark"] as const).map(
    (scheme) => [`${source.id} ${scheme}`, colorsOf(source, scheme)] as const,
  ),
);

describe("the pairs generated themes are held to", () => {
  it.each(BUILT_IN)("are all met by the built-in theme %s", (_name, colors) => {
    expect(failingUsedPairs(colors)).toEqual([]);
  });

  it("ask text roles for text contrast and indicators for the non-text level", () => {
    const indicators = ["focus-ring", "border-strong", "danger", "success", "info"];
    for (const pair of BUILT_IN_PAIRS) {
      expect(pair.minimum, `${pair.foreground} on ${pair.background}`).toBe(
        indicators.includes(pair.foreground) ? 3 : 4.5,
      );
    }
  });
});
