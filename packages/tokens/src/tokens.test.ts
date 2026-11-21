import { describe, expect, it } from "vitest";
import { buildTokenFiles } from "./build-token-files.ts";
import { THEME_IDS } from "./theme-ids.ts";
import { TOKEN_SOURCES } from "./theme-sources.ts";
import { TOKEN_NAMES } from "./token-names.ts";

const files = buildTokenFiles(TOKEN_SOURCES);

describe("built tokens", () => {
  it("emits the base, one file per theme and the bundle", () => {
    expect(Object.keys(files).sort()).toEqual(
      ["index.css", "tokens.css", ...THEME_IDS.map((id) => `themes/${id}.css`)].sort(),
    );
  });

  it("is deterministic: two builds are byte-identical and carry no timestamps", () => {
    const again = buildTokenFiles(TOKEN_SOURCES);
    expect(again).toEqual(files);
    expect(files["index.css"]).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
  });

  it("prefixes every custom property with --idg-", () => {
    for (const name of TOKEN_NAMES) expect(name).toMatch(/^--idg-/);
  });

  it("only sets custom properties that the base layer declares", () => {
    const declared = new Set(TOKEN_NAMES);
    for (const [name, css] of Object.entries(files)) {
      for (const match of css.matchAll(/^\s+(--[a-z0-9-]+):/gm)) {
        expect(declared.has(match[1] ?? ""), `${name} sets undeclared ${match[1] ?? ""}`).toBe(
          true,
        );
      }
    }
  });

  it("keeps theme files to colour and typography; shape, elevation, density and motion stay in the base", () => {
    for (const id of THEME_IDS) {
      const css = files[`themes/${id}.css`] ?? "";
      expect(css, id).not.toMatch(/--idg-(shape|elevation|density|motion|space)-/);
      expect(css, id).toMatch(/--idg-gradient-brand:/);
    }
  });

  it("defines the required semantic roles and scales", () => {
    const names = new Set(TOKEN_NAMES);
    for (const required of [
      "--idg-color-bg",
      "--idg-color-focus-ring",
      "--idg-color-on-danger-subtle",
      "--idg-gradient-brand",
      "--idg-font-family-display",
      "--idg-font-family-mono",
      "--idg-font-size-step-neg1",
      "--idg-font-size-step-6",
      "--idg-space-3xs",
      "--idg-space-3xl",
    ]) {
      expect(names.has(required), required).toBe(true);
    }
    expect(files["tokens.css"]).toMatch(/--idg-font-size-step-0: clamp\(/);
    expect(files["tokens.css"]).toMatch(/--idg-space-m: clamp\(/);
  });

  it("makes the default theme answer to a bare :root and only that theme", () => {
    expect(files["themes/aurora.css"]).toContain(":where(:root)");
    for (const id of THEME_IDS.filter((candidate) => candidate !== "aurora")) {
      expect(files[`themes/${id}.css`], id).not.toContain(":root");
    }
  });
});
