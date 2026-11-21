import { describe, expect, it } from "vitest";
import { NAVIGATION_MODES, navigationModeOf } from "./layout-options";

describe("navigationModeOf", () => {
  it.each(NAVIGATION_MODES)("reads %s from the shell's custom property", (mode) => {
    expect(navigationModeOf(mode)).toBe(mode);
  });

  it("ignores the whitespace a computed custom property keeps", () => {
    expect(navigationModeOf(" drawer ")).toBe("drawer");
  });

  it.each(["", "popup", "DRAWER", "inline drawer"])(
    "falls back to inline, which hides nothing, for %j",
    (value) => {
      expect(navigationModeOf(value)).toBe("inline");
    },
  );

  it("lists the three ways the navigation can be drawn", () => {
    expect(NAVIGATION_MODES).toEqual(["inline", "disclosure", "drawer"]);
  });
});
