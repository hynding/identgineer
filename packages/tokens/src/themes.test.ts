import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { flattenTokens } from "./flatten-tokens.ts";
import { formatValue } from "./emit-css.ts";
import { mergeTokens } from "./merge-tokens.ts";
import { parseTheme } from "./parse-theme.ts";
import { resolveThemeScheme } from "./resolve-theme.ts";
import { SCHEMES } from "./scheme.ts";
import { THEME_IDS } from "./theme-ids.ts";
import { THEMES } from "./theme-registry.ts";
import { SHARED_SOURCES, THEME_SOURCES } from "./theme-sources.ts";
import { findThemeProblems } from "./verify-theme.ts";

const shared = mergeTokens(...SHARED_SOURCES.map(({ file, json }) => flattenTokens(file, json)));
const semanticSource = SHARED_SOURCES.find(({ file }) => file.endsWith("semantic.json"));
const semantic = flattenTokens("semantic.json", semanticSource?.json);
const parsed = THEME_SOURCES.map(parseTheme);

describe("theme registry", () => {
  it("has exactly eight themes with unique ids, aurora first", () => {
    expect(THEMES).toHaveLength(8);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(8);
    expect(THEMES[0]?.id).toBe("aurora");
  });

  it("matches the theme files on disk, so a file cannot be added or dropped silently", () => {
    const directory = fileURLToPath(new URL("./tokens/themes/", import.meta.url));
    const onDisk = readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/, ""))
      .sort();
    expect(onDisk).toEqual([...THEME_IDS].sort());
    expect(THEMES.map((theme) => theme.id)).toEqual([...THEME_IDS]);
  });

  it("is derived from the JSON: labels, descriptions and swatches are the resolved source values", () => {
    for (const theme of THEMES) {
      expect(theme.label).not.toBe("");
      expect(theme.description.length).toBeGreaterThan(20);
      for (const scheme of SCHEMES) {
        for (const colour of Object.values(theme.swatches[scheme])) {
          expect(colour).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
    const aurora = parsed.find((theme) => theme.id === "aurora");
    const light = resolveThemeScheme(shared, parsed[0] ?? fail(), "light");
    expect(aurora?.label).toBe(THEMES[0]?.label);
    expect(THEMES[0]?.swatches.light.accent).toBe(
      light.find((token) => token.path === "color.accent")?.value,
    );
  });
});

describe.each(parsed)("theme $id", (theme) => {
  it("defines every semantic role in both schemes and nothing it does not own", () => {
    expect(findThemeProblems(theme, semantic)).toEqual([]);
  });
});

describe("findThemeProblems", () => {
  it("reports a missing role with file, scheme and token", () => {
    const [first] = parsed;
    if (!first) throw new Error("no themes");
    const broken = { ...first, dark: first.dark.filter((token) => token.path !== "color.link") };
    expect(findThemeProblems(broken, semantic)).toEqual([
      `${first.file}: dark scheme does not define "color.link"`,
    ]);
  });

  it("reports tokens outside the colour and typography roles", () => {
    const [first] = parsed;
    if (!first) throw new Error("no themes");
    const leaking = {
      ...first,
      common: [
        ...first.common,
        {
          path: "shape.radius.m",
          type: "dimension" as const,
          value: "1px",
          description: undefined,
          source: first.file,
        },
      ],
    };
    expect(findThemeProblems(leaking, semantic)).toEqual([
      `${first.file}: "shape.radius.m" is not a theme-owned role (themes own colour and typography only)`,
    ]);
  });
});

describe("distinctness", () => {
  it("no two themes share accent, background and display font in the light scheme", () => {
    const signatures = parsed.map((theme) => {
      const light = resolveThemeScheme(shared, theme, "light");
      const pick = (path: string) => {
        const token = light.find((candidate) => candidate.path === path);
        return token ? formatValue(token) : `missing ${path}`;
      };
      return [pick("color.accent"), pick("color.bg"), pick("font.family.display")].join(" | ");
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

function fail(): never {
  throw new Error("no themes");
}
