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
        "MAX_REPORTED_REMOVALS",
        "NAME_MAX_LENGTH",
        "RESERVED_BRAND_IDS",
        "STATUS_NEAR_ACCENT",
        "SVG_DRAWING_WEIGHTS",
        "SVG_LOGO_LIMITS",
        "TAGLINE_MAX_LENGTH",
        "TONES",
        "TYPOGRAPHY_IDS",
        "emitBrandThemeCss",
        "emitBrandThemeTokens",
        "generateBrandTheme",
        "isSanitisedSvgLogo",
        "logoDataUrl",
        "parseBrandKit",
        "sanitiseSvgLogo",
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

  it("sanitises an uploaded logo for a kit and an image, without a DOM", () => {
    const upload = brand.sanitiseSvgLogo(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1" onload="alert(1)"><rect width="2" height="1"/></svg>',
    );
    if (!upload.ok) throw new Error("expected a logo");
    expect(upload.removed).toEqual([expect.objectContaining({ attribute: "onload" })]);
    const result = brand.parseBrandKit({
      id: "acme",
      name: "Acme",
      colors: { primary: "#4f46e5" },
      typography: "system",
      corners: "sharp",
      tone: "calm",
      logo: upload.svg,
    });
    if (!result.ok || result.kit.logo === undefined) throw new Error("expected a kit with a logo");
    expect(brand.logoDataUrl(result.kit.logo)).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,%3Csvg/,
    );
  });
});
