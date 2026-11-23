import { describe, expect, it } from "vitest";
import * as brand from "./index.ts";

describe("the public API", () => {
  it("exports the documented surface and nothing else", () => {
    expect(Object.keys(brand).sort()).toEqual(
      [
        "ACCENT_BLENDS_WITH_PAGE",
        "BRAND_ID_MAX_LENGTH",
        "BRAND_ID_MIN_LENGTH",
        "CORNERS",
        "CORNER_RADII",
        "FONT_PAIRINGS",
        "NAME_MAX_LENGTH",
        "RESERVED_BRAND_IDS",
        "STATUS_NEAR_ACCENT",
        "TAGLINE_MAX_LENGTH",
        "TONES",
        "TYPOGRAPHY_IDS",
        "emitBrandThemeCss",
        "emitBrandThemeTokens",
        "generateBrandTheme",
        "parseBrandKit",
      ].sort(),
    );
  });

  it("turns untrusted input into a data-theme stylesheet end to end, without a DOM", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const result = brand.parseBrandKit({
      id: "acme",
      name: "Acme",
      colors: { primary: "#4f46e5" },
      typography: "system",
      corners: "sharp",
      tone: "calm",
    });
    if (!result.ok) throw new Error("expected a kit");
    const css = brand.emitBrandThemeCss(brand.generateBrandTheme(result.kit));
    expect(css).toContain('[data-theme="acme"] {');
    expect(css).toContain('[data-theme="acme"][data-scheme="dark"] {');
  });
});
