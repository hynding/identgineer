import { describe, expect, it } from "vitest";
import { CONTRAST_PAIRS, findContrastFailures, formatContrastFailure } from "./check-contrast.ts";
import { flattenTokens } from "./flatten-tokens.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { parseTheme } from "./parse-theme.ts";
import { resolveThemeScheme } from "./resolve-theme.ts";
import { SCHEMES } from "./scheme.ts";
import { SHARED_SOURCES, THEME_SOURCES } from "./theme-sources.ts";

const shared = mergeTokens(...SHARED_SOURCES.map(({ file, json }) => flattenTokens(file, json)));

function colorsFor(source: (typeof THEME_SOURCES)[number], scheme: (typeof SCHEMES)[number]) {
  const tokens = resolveThemeScheme(shared, parseTheme(source), scheme);
  const colors = new Map<string, string>();
  for (const token of tokens) {
    if (token.type === "color" && typeof token.value === "string") {
      colors.set(token.path.replace(/^color\./, ""), token.value);
    }
  }
  return colors;
}

describe("check-contrast", () => {
  it("covers the pairs the design requires, at the right thresholds", () => {
    const find = (foreground: string, background: string) =>
      CONTRAST_PAIRS.find(
        (pair) => pair.foreground === foreground && pair.background === background,
      );
    for (const background of ["bg", "surface", "surface-raised"]) {
      expect(find("text", background)?.minimum).toBe(4.5);
    }
    expect(find("text-muted", "bg")?.minimum).toBe(4.5);
    expect(find("text-muted", "surface")?.minimum).toBe(4.5);
    expect(find("on-accent", "accent")?.minimum).toBe(4.5);
    expect(find("on-accent-subtle", "accent-subtle")?.minimum).toBe(4.5);
    expect(find("link", "bg")?.minimum).toBe(4.5);
    for (const status of ["success", "warning", "danger", "info"]) {
      expect(find(`on-${status}`, status)?.minimum).toBe(4.5);
      expect(find(`on-${status}-subtle`, `${status}-subtle`)?.minimum).toBe(4.5);
    }
    expect(find("focus-ring", "bg")?.minimum).toBe(3);
    expect(find("border-strong", "bg")?.minimum).toBe(3);
  });

  it("reports a failing pair with its ratio and threshold", () => {
    const colors = new Map([
      ["text", "#777777"],
      ["bg", "#ffffff"],
    ]);
    const [failure] = findContrastFailures(colors).filter((f) => f.pair.foreground === "text");
    expect(failure && formatContrastFailure("demo", "light", failure)).toBe(
      "demo light: text on bg is 4.48:1, needs 4.5:1",
    );
  });

  it("reports a role that is missing instead of skipping its pairs", () => {
    const failures = findContrastFailures(new Map([["bg", "#ffffff"]]));
    expect(failures.some((f) => f.reason === "missing")).toBe(true);
  });
});

describe.each(THEME_SOURCES.map((source) => [source.id, source] as const))(
  "WCAG 2.2 AA contrast, theme %s",
  (id, source) => {
    it.each(SCHEMES)("%s scheme meets every required pair", (scheme) => {
      const failures = findContrastFailures(colorsFor(source, scheme));
      expect(failures.map((failure) => formatContrastFailure(id, scheme, failure))).toEqual([]);
    });
  },
);
