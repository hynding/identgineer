import { describe, expect, it } from "vitest";
import { ICON_NAMES, ICON_PATHS } from "./icon-paths";

const LIBRARY_NEEDS = [
  "chevron-up",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "arrow-up",
  "arrow-down",
  "arrow-left",
  "arrow-right",
  "check",
  "close",
  "plus",
  "minus",
  "search",
  "eye",
  "eye-off",
  "info",
  "warning",
  "error",
  "success",
  "user",
  "settings",
  "menu",
  "external-link",
  "copy",
  "trash",
  "edit",
  "calendar",
  "clock",
  "lock",
  "mail",
  "bell",
  "home",
  "chart",
  "shield",
  "sparkles",
  "sun",
  "moon",
];

// Path data only: commands, numbers and separators. Anything else (a script, a url, markup)
// would not be geometry.
const GEOMETRY = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;

describe("icon paths", () => {
  it("has every icon the library needs", () => {
    expect([...ICON_NAMES].sort()).toEqual([...LIBRARY_NEEDS].sort());
  });

  it.each(ICON_NAMES.map((name) => [name] as const))("%s is plain geometry", (name) => {
    const paths = ICON_PATHS[name];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path).toMatch(/^M/);
      expect(path).toMatch(GEOMETRY);
    }
  });

  it("gives no two icons the same drawing", () => {
    const drawings = ICON_NAMES.map((name) => ICON_PATHS[name].join(" "));
    expect(new Set(drawings).size).toBe(drawings.length);
  });
});
