import { describe, expect, it } from "vitest";
import {
  CONTROLS,
  describeChange,
  parseControls,
  swatchColour,
  type ControlName,
} from "./variation-switcher-options";

describe("parseControls", () => {
  it("shows every control when no list is given", () => {
    expect(parseControls(undefined)).toEqual(CONTROLS);
    expect(parseControls("")).toEqual(CONTROLS);
    expect(parseControls("   ")).toEqual(CONTROLS);
  });

  it("keeps the named controls, in the panel's own order whatever the order written", () => {
    expect(parseControls("scheme,theme")).toEqual(["theme", "scheme"]);
    expect(parseControls("ux, layout")).toEqual(["layout", "ux"]);
  });

  it("ignores unknown names, repeats and empty entries", () => {
    expect(parseControls("theme,nope,theme,,Design,__proto__")).toEqual(["theme"]);
  });

  it("falls back to every control when no name is known, since an empty panel is useless", () => {
    expect(parseControls("nope,also-nope")).toEqual(CONTROLS);
  });

  it("is not fooled by a non-string", () => {
    expect(parseControls(42 as unknown as string)).toEqual(CONTROLS);
  });
});

describe("swatchColour", () => {
  it("accepts the hex colours the registry holds", () => {
    expect(swatchColour("#4f46e5")).toBe("#4f46e5");
    expect(swatchColour("#FFF")).toBe("#FFF");
    expect(swatchColour("#ffffff80")).toBe("#ffffff80");
  });

  it.each(["red", "url(#x)", "#12", "#12345", "#gggggg", 'x" onload="y', "#fff;", " #fff", ""])(
    "refuses %j, so nothing but a colour can reach a fill attribute",
    (value) => {
      expect(swatchColour(value)).toBeUndefined();
    },
  );
});

describe("describeChange", () => {
  const state = {
    theme: "ember",
    design: "glass",
    layout: "bento",
    ux: "focus",
    scheme: "dark",
  } as const;

  it("names the control and the chosen option by its label", () => {
    expect(describeChange("theme", state)).toBe("Theme: Ember.");
    expect(describeChange("design", state)).toBe("Design: Glass.");
    expect(describeChange("scheme", state)).toBe("Scheme: Dark.");
  });

  it("names the system scheme in words", () => {
    expect(describeChange("scheme", { ...state, scheme: "system" })).toBe("Scheme: System.");
  });

  it("names the whole state for a shuffle", () => {
    const names: readonly ControlName[] = ["theme", "design", "layout", "ux"];
    expect(describeChange(names, state)).toBe(
      "Theme: Ember. Design: Glass. Layout: Bento. UX: Focus.",
    );
  });
});
