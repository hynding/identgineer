import {
  DESIGN_IDS,
  LAYOUT_IDS,
  SCHEMES,
  THEME_IDS,
  THEMES,
  UX_MODE_IDS,
  DEFAULT_DESIGN_ID,
  DEFAULT_LAYOUT_ID,
  DEFAULT_THEME_ID,
  DEFAULT_UX_MODE_ID,
} from "@identgineer/tokens";
import { describe, expect, it } from "vitest";
import { AXES, REGISTRY } from "./registry.ts";

const TOKEN_IDS = {
  theme: THEME_IDS,
  design: DESIGN_IDS,
  layout: LAYOUT_IDS,
  ux: UX_MODE_IDS,
};

describe("registry", () => {
  it("covers exactly the ids of the token package, in the same order", () => {
    for (const axis of AXES) {
      expect(REGISTRY[axis].variations.map((variation) => variation.id)).toEqual([
        ...TOKEN_IDS[axis],
      ]);
    }
  });

  it("has at least eight variations on every axis", () => {
    for (const axis of AXES) {
      expect(REGISTRY[axis].variations.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("names the attribute and the default of every axis", () => {
    expect(REGISTRY.theme).toMatchObject({ attribute: "data-theme", defaultId: DEFAULT_THEME_ID });
    expect(REGISTRY.design).toMatchObject({
      attribute: "data-design",
      defaultId: DEFAULT_DESIGN_ID,
    });
    expect(REGISTRY.layout).toMatchObject({
      attribute: "data-layout",
      defaultId: DEFAULT_LAYOUT_ID,
    });
    expect(REGISTRY.ux).toMatchObject({ attribute: "data-ux", defaultId: DEFAULT_UX_MODE_ID });
  });

  it("lists every default among its own variations", () => {
    for (const axis of AXES) {
      const ids = REGISTRY[axis].variations.map((variation) => variation.id);
      expect(ids).toContain(REGISTRY[axis].defaultId);
    }
  });

  it("offers light, dark and system for the scheme, which follows the system by default", () => {
    expect(REGISTRY.scheme).toEqual({
      attribute: "data-scheme",
      defaultId: "system",
      ids: [...SCHEMES, "system"],
    });
  });

  it("previews a theme with its swatches for both schemes and its fonts", () => {
    const aurora = THEMES.find((theme) => theme.id === "aurora");
    expect(REGISTRY.theme.variations[0]).toEqual({
      id: "aurora",
      label: aurora?.label,
      description: aurora?.description,
      preview: { kind: "theme", swatches: aurora?.swatches, fonts: aurora?.fonts },
    });
  });

  it("previews the other axes with the label and description the token registries expose", () => {
    for (const axis of ["design", "layout", "ux"] as const) {
      for (const variation of REGISTRY[axis].variations) {
        expect(variation.label).not.toBe("");
        expect(variation.preview).toEqual({
          kind: "text",
          label: variation.label,
          description: variation.description,
        });
      }
    }
  });

  it("is frozen all the way down, so a consumer cannot alter what the allowlist accepts", () => {
    expect(Object.isFrozen(REGISTRY)).toBe(true);
    expect(Object.isFrozen(REGISTRY.theme)).toBe(true);
    expect(Object.isFrozen(REGISTRY.theme.variations)).toBe(true);
    expect(Object.isFrozen(REGISTRY.theme.variations[0])).toBe(true);
    expect(Object.isFrozen(REGISTRY.theme.variations[0]?.preview)).toBe(true);
    expect(Object.isFrozen(REGISTRY.scheme.ids)).toBe(true);
  });
});
