import { describe, expect, it } from "vitest";
import { buildTokenFiles } from "./build-token-files.ts";
import { DESIGN_IDS } from "./design-ids.ts";
import { LAYER_ORDER } from "./emit-css.ts";
import { LAYOUT_IDS } from "./layout-ids.ts";
import { THEME_IDS } from "./theme-ids.ts";
import { TOKEN_NAMES } from "./token-names.ts";
import { TOKEN_SOURCES } from "./token-sources.ts";
import { UX_MODE_IDS } from "./ux-ids.ts";

const files = buildTokenFiles(TOKEN_SOURCES);

describe("built tokens", () => {
  it("emits the base, one file per theme, design, layout and UX mode, the preferences and the bundle", () => {
    expect(Object.keys(files).sort()).toEqual(
      [
        "index.css",
        "tokens.css",
        "preferences.css",
        ...THEME_IDS.map((id) => `themes/${id}.css`),
        ...DESIGN_IDS.map((id) => `designs/${id}.css`),
        ...LAYOUT_IDS.map((id) => `layouts/${id}.css`),
        ...UX_MODE_IDS.map((id) => `ux/${id}.css`),
      ].sort(),
    );
  });

  it("declares the layer order once per file, with preferences last so they win over every mode", () => {
    expect(LAYER_ORDER).toBe(
      "@layer idg.tokens, idg.theme, idg.design, idg.layout, idg.ux, idg.preferences;",
    );
    for (const [name, css] of Object.entries(files)) {
      expect(css.split(LAYER_ORDER).length - 1, name).toBe(1);
    }
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

  it("keeps theme files to colour and typography; design and UX tokens never appear there", () => {
    const owned =
      /--idg-(shape|border|elevation|surface|focus|ornament|density|layout|motion|feedback|ux|space|size)-/;
    for (const id of THEME_IDS) {
      const css = files[`themes/${id}.css`] ?? "";
      expect(css, id).not.toMatch(owned);
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
      "--idg-shape-radius-pill",
      "--idg-elevation-lg",
      "--idg-surface-backdrop-filter",
      "--idg-focus-ring-offset",
      "--idg-ornament-hard-shadow-x",
      "--idg-density-target-size",
      "--idg-density-gap-scale",
      "--idg-size-m",
      "--idg-size-screen",
      "--idg-layout-content-max",
      "--idg-layout-page-gutter",
      "--idg-layout-section-gap",
      "--idg-layout-gap",
      "--idg-layout-columns",
      "--idg-layout-grid-min",
      "--idg-layout-aside-width",
      "--idg-layout-nav-size",
      "--idg-ux-hints",
      "--idg-ux-shortcuts",
      "--idg-ux-type-scale",
      "--idg-motion-enabled",
      "--idg-feedback-press-scale",
      "--idg-feedback-hover-delay",
      "--idg-focus-emphasis",
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

  it("makes the default design, layout and UX mode, and only those, answer to a bare :root", () => {
    expect(files["designs/flat.css"]).toContain(":where(:root)");
    expect(files["layouts/top-bar.css"]).toContain(":where(:root)");
    for (const id of LAYOUT_IDS.filter((candidate) => candidate !== "top-bar")) {
      expect(files[`layouts/${id}.css`], id).not.toContain(":root");
    }
    expect(files["ux/comfortable.css"]).toContain(":where(:root)");
    for (const id of DESIGN_IDS.filter((candidate) => candidate !== "flat")) {
      expect(files[`designs/${id}.css`], id).not.toContain(":root");
    }
    for (const id of UX_MODE_IDS.filter((candidate) => candidate !== "comfortable")) {
      expect(files[`ux/${id}.css`], id).not.toContain(":root");
    }
  });

  it("selects designs, layouts and UX modes by attribute", () => {
    for (const id of LAYOUT_IDS)
      expect(files[`layouts/${id}.css`]).toContain(`[data-layout="${id}"]`);
    for (const id of DESIGN_IDS)
      expect(files[`designs/${id}.css`]).toContain(`[data-design="${id}"]`);
    for (const id of UX_MODE_IDS) expect(files[`ux/${id}.css`]).toContain(`[data-ux="${id}"]`);
  });

  it("degrades glass to an opaque surface without backdrop-filter and under reduced transparency", () => {
    const glass = files["designs/glass.css"] ?? "";
    expect(glass).toContain("@supports not ((backdrop-filter: blur(1px))");
    expect(glass).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(glass.match(/--idg-surface-background: var\(--idg-color-surface\);/g)).toHaveLength(2);
    expect(files["designs/flat.css"]).not.toContain("@supports");
  });

  it("handles the three user preferences in the final layer", () => {
    const preferences = files["preferences.css"] ?? "";
    expect(preferences).toContain("@media (prefers-reduced-motion: reduce)");
    expect(preferences).toContain("@media (prefers-contrast: more)");
    expect(preferences).toContain("@media (forced-colors: active)");
    expect(preferences).toContain("--idg-motion-enabled: 0;");
    expect(preferences).toContain("--idg-border-color: var(--idg-color-text);");
    expect(preferences).toContain("--idg-elevation-md: none;");
    expect(preferences).toContain("--idg-surface-backdrop-filter: none;");
  });

  it("includes every stylesheet in the bundle", () => {
    const index = files["index.css"] ?? "";
    for (const id of DESIGN_IDS) expect(index).toContain(`[data-design="${id}"]`);
    for (const id of LAYOUT_IDS) expect(index).toContain(`[data-layout="${id}"]`);
    for (const id of UX_MODE_IDS) expect(index).toContain(`[data-ux="${id}"]`);
    expect(index).toContain("@layer idg.preferences {");
  });
});
