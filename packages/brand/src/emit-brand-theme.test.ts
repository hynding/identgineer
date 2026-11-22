import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  emitThemeCss,
  findThemeProblems,
  parseTheme,
  resolveThemeScheme,
} from "@identgineer/tokens/theme-pipeline";
import { TOKEN_NAMES } from "@identgineer/tokens";
import { describe, expect, it } from "vitest";
import { COLOR_ROLES } from "./brand-theme-document.ts";
import { emitBrandThemeCss, emitBrandThemeTokens } from "./emit-brand-theme.ts";
import { readEmittedCss } from "./emitted-css-grammar.ts";
import { generateBrandTheme, type BrandTheme } from "./generate-brand-theme.ts";
import { parseBrandKit } from "./parse-brand-kit.ts";
import { kitFrom, SEMANTIC, SHARED } from "./test-support.ts";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

function themeFromFixture(name: string): BrandTheme {
  const result = parseBrandKit(JSON.parse(read(`./__fixtures__/${name}.kit.json`)));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return generateBrandTheme(result.kit);
}

const GOLDEN = ["acme", "harbour-lights"] as const;

describe.each(GOLDEN)("golden brand theme %s", (name) => {
  it("emits the CSS byte for byte as the golden file", () => {
    expect(emitBrandThemeCss(themeFromFixture(name))).toBe(read(`./__golden__/${name}.css`));
  });

  it("emits the DTCG JSON byte for byte as the golden file", () => {
    expect(emitBrandThemeTokens(themeFromFixture(name))).toBe(
      read(`./__golden__/${name}.tokens.json`),
    );
  });

  it("is idempotent: a second generation and emission is byte-identical", () => {
    const first = themeFromFixture(name);
    const second = themeFromFixture(name);
    expect(emitBrandThemeCss(second)).toBe(emitBrandThemeCss(first));
    expect(emitBrandThemeTokens(second)).toBe(emitBrandThemeTokens(first));
    expect(emitBrandThemeCss(first)).toBe(emitBrandThemeCss(first));
  });
});

describe("emitBrandThemeCss", () => {
  const theme = generateBrandTheme(kitFrom({ corners: "round" }));
  const css = emitBrandThemeCss(theme);

  it("contains the tokens package's own theme emission for the generated document", () => {
    const parsed = parseTheme({ id: "acme", file: "brand/acme.json", json: theme.document });
    expect(css).toContain(
      emitThemeCss({
        id: "acme",
        isDefault: false,
        light: resolveThemeScheme(SHARED, parsed, "light"),
        dark: resolveThemeScheme(SHARED, parsed, "dark"),
      }),
    );
  });

  it("is exactly the expected custom properties under the expected selectors, and nothing else", () => {
    const themed = '[data-theme="acme"]';
    const blocks = readEmittedCss(css, [
      themed,
      `${themed}[data-scheme="dark"]`,
      `${themed}:not([data-scheme="light"])`,
    ]);
    const colors = COLOR_ROLES.map((role) => `--idg-color-${role}`);
    const typography = [
      "--idg-font-family-display",
      "--idg-font-family-body",
      "--idg-font-family-mono",
      "--idg-font-display-weight",
      "--idg-font-display-letter-spacing",
      "--idg-font-display-line-height",
      "--idg-font-body-letter-spacing",
      "--idg-font-body-line-height",
    ];
    const dark = ["color-scheme", ...colors, "--idg-gradient-brand"];
    expect(
      blocks.map((block) => ({
        context: block.context,
        selectors: block.selectors,
        names: block.declarations.map(([property]) => property),
      })),
    ).toEqual([
      {
        context: ["@layer idg.theme"],
        selectors: [themed],
        names: ["color-scheme", ...colors, "--idg-gradient-brand", ...typography],
      },
      { context: ["@layer idg.theme"], selectors: [`${themed}[data-scheme="dark"]`], names: dark },
      {
        context: ["@layer idg.theme", "@media (prefers-color-scheme: dark)"],
        selectors: [`${themed}:not([data-scheme="light"])`],
        names: dark,
      },
      {
        context: ["@layer idg.brand"],
        selectors: [themed],
        names: [
          "--idg-shape-radius-sm",
          "--idg-shape-radius-md",
          "--idg-shape-radius-lg",
          "--idg-shape-radius-pill",
        ],
      },
    ]);
  });

  it("sets only custom properties the tokens base layer declares", () => {
    const declared = new Set(TOKEN_NAMES);
    for (const match of css.matchAll(/^\s+(--[a-z0-9-]+):/gm)) {
      expect(declared.has(match[1] ?? "")).toBe(true);
    }
  });

  it("writes the corner radii into the brand layer", () => {
    expect(css).toContain("--idg-shape-radius-md: 1rem;");
  });

  it("never writes the kit's name or tagline", () => {
    const named = generateBrandTheme(kitFrom({ name: "Zyxwv Qjxk", tagline: "Vbnmq plokij" }));
    const output = emitBrandThemeCss(named);
    expect(output).not.toMatch(/Zyxwv|Qjxk|Vbnmq|plokij/);
  });

  it("refuses a theme altered after generation", () => {
    const altered = {
      ...theme,
      document: {
        ...theme.document,
        light: {
          ...theme.document.light,
          color: { ...theme.document.light.color, bg: { $value: "red;} body{display:none}" } },
        },
      },
    };
    expect(() => emitBrandThemeCss(altered)).toThrow(/altered/);
    expect(() => emitBrandThemeTokens(altered)).toThrow(/altered/);
  });

  it.each([
    ["an id that is not a slug", { id: 'acme"] body{display:none} [x="' }],
    ["a built-in id", { id: "aurora" }],
    ["a prototype key for corners", { corners: "__proto__" }],
    ["a prototype key for tone", { tone: "constructor" }],
    ["an unknown font pairing", { typography: "Comic Sans MS" }],
    ["a colour channel that is not a byte", { colors: { primary: ["1;}", 0, 0] } }],
    ["a colour with four channels", { colors: { primary: [1, 2, 3, 4] } }],
    ["a name with markup", { name: "</style><script>" }],
  ])("refuses a hand-built kit with %s", (_label, change) => {
    const kit = { ...theme.kit, ...change } as unknown as BrandTheme["kit"];
    expect(() => emitBrandThemeCss({ ...theme, kit })).toThrow();
    expect(() => generateBrandTheme(kit)).toThrow();
  });
});

describe("emitBrandThemeTokens", () => {
  const theme = generateBrandTheme(
    kitFrom({ name: "Ben & Jerry's", tagline: "Fresh, cold & sweet!" }),
  );
  const json = emitBrandThemeTokens(theme);

  it("is the theme document as formatted JSON, which the tokens pipeline accepts unchanged", () => {
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toEqual(theme.document);
    expect(
      findThemeProblems(parseTheme({ id: theme.id, file: "brand.json", json: parsed }), SEMANTIC),
    ).toEqual([]);
    expect(json.endsWith("}\n")).toBe(true);
  });

  it("escapes the characters that matter when JSON is embedded in HTML", () => {
    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    expect(json).toContain("Ben \\u0026 Jerry's");
  });
});
