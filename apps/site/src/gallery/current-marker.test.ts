import { REGISTRY, type VariationsRegistry } from "@identgineer/variations";
import { describe, expect, it } from "vitest";
import { currentMarkerCss } from "./current-marker.ts";
import { galleryRecords } from "./gallery-records.ts";

describe("the stylesheet that marks each axis's current tile from the root's attribute", () => {
  const css = currentMarkerCss(galleryRecords());

  it("has a rule for every value of every axis: the root's attribute names it", () => {
    for (const axis of ["theme", "design", "layout", "ux"] as const) {
      for (const value of REGISTRY[axis].variations) {
        expect(css).toContain(
          `:root[data-${axis}="${value.id}"] .gallery-tile[data-axis="${axis}"][data-value="${value.id}"]`,
        );
      }
    }
  });

  it("marks the default of an axis as well where the root names no value, and no other value", () => {
    expect(css).toContain(
      `:root:not([data-theme]) .gallery-tile[data-axis="theme"][data-value="aurora"]`,
    );
    expect(css).not.toContain(
      `:root:not([data-theme]) .gallery-tile[data-axis="theme"][data-value="ember"]`,
    );
    expect(css.match(/:root:not\(\[data-[a-z]+\]\)/g)).toHaveLength(8);
  });

  it("shows the label of the current tile and outlines it, in two rules for each value", () => {
    const rules = css.split("\n").filter((line) => line.includes("{"));
    expect(rules).toHaveLength(64);
    expect(rules.filter((rule) => rule.includes(".tile-current"))).toHaveLength(32);
    expect(css).toContain("display: inline-block");
    expect(css).toContain("outline:");
  });

  it("is the same text every time, and holds nothing a style rule could not", () => {
    expect(currentMarkerCss(galleryRecords())).toBe(css);
    expect(css).not.toMatch(/[<>]|url\(|@import|expression/);
  });

  it("covers a ninth value without any other change", () => {
    const [first] = REGISTRY.theme.variations;
    if (first === undefined) throw new Error("no theme");
    const registry: VariationsRegistry = {
      ...REGISTRY,
      theme: {
        ...REGISTRY.theme,
        variations: [...REGISTRY.theme.variations, { ...first, id: "dusk" as never }],
      },
    };
    expect(currentMarkerCss(galleryRecords(registry))).toContain(
      `:root[data-theme="dusk"] .gallery-tile[data-axis="theme"][data-value="dusk"]`,
    );
  });
});
