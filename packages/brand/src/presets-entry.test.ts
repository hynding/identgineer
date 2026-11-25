import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as brand from "./index.ts";
import * as presetsEntry from "./presets-entry.ts";
import { runtimeImports } from "./runtime-imports.ts";

const SOURCE = fileURLToPath(new URL(".", import.meta.url));

describe("the presets entry", () => {
  it("exports the choices a brand kit makes from, and nothing else", () => {
    expect(Object.keys(presetsEntry).sort()).toEqual([
      "CORNERS",
      "CORNER_RADII",
      "FONT_PAIRINGS",
      "RADIUS_NAMES",
      "TONES",
      "TYPOGRAPHY_IDS",
    ]);
  });

  it("exports the index's own values", () => {
    expect(presetsEntry.FONT_PAIRINGS).toBe(brand.FONT_PAIRINGS);
    expect(presetsEntry.TYPOGRAPHY_IDS).toBe(brand.TYPOGRAPHY_IDS);
    expect(presetsEntry.CORNER_RADII).toBe(brand.CORNER_RADII);
    expect(presetsEntry.CORNERS).toBe(brand.CORNERS);
    expect(presetsEntry.TONES).toBe(brand.TONES);
  });

  it("names the radii each corner style sets", () => {
    for (const corners of presetsEntry.CORNERS) {
      expect(Object.keys(presetsEntry.CORNER_RADII[corners]).sort()).toEqual(
        [...presetsEntry.RADIUS_NAMES].sort(),
      );
    }
  });

  it("loads no module and no package, so a browser bundle takes data and nothing else", () => {
    const { files, packages } = runtimeImports(resolve(SOURCE, "presets-entry.ts"));
    expect([...packages]).toEqual([]);
    expect([...files].map((file) => file.slice(SOURCE.length)).sort()).toEqual([
      "brand-kit.ts",
      "corner-radii.ts",
      "font-pairings.ts",
      "presets-entry.ts",
    ]);
  });
});
