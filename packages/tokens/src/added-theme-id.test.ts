import { describe, expect, it } from "vitest";
import {
  ADDED_THEME_ID_RULE,
  findAddedThemeIdProblem,
  RESERVED_THEME_IDS,
} from "./added-theme-id.ts";
import { DESIGN_IDS } from "./design-ids.ts";
import { LAYOUT_IDS } from "./layout-ids.ts";
import { THEME_IDS } from "./theme-ids.ts";
import { UX_MODE_IDS } from "./ux-ids.ts";

describe("the added theme id rule", () => {
  it.each(["ab", "acme", "acme-co", "a1", "brand-2026", "x".repeat(32)])("accepts %j", (id) => {
    expect(findAddedThemeIdProblem(id)).toBeUndefined();
  });

  it.each([
    ["one character", "a", "too-short"],
    ["too many characters", "x".repeat(33), "too-long"],
    ["upper case", "Acme", "invalid-id"],
    ["an underscore", "acme_co", "invalid-id"],
    ["a leading digit", "1acme", "invalid-id"],
    ["a double hyphen", "acme--co", "invalid-id"],
    ["a trailing hyphen", "acme-", "invalid-id"],
    ["a non-ASCII letter", "acmé", "invalid-id"],
  ])("refuses %s", (_label, id, code) => {
    expect(findAddedThemeIdProblem(id)?.code).toBe(code);
  });

  it("reserves every built-in id of every axis, so an added theme cannot be mistaken for one", () => {
    for (const id of [...THEME_IDS, ...DESIGN_IDS, ...LAYOUT_IDS, ...UX_MODE_IDS]) {
      expect(RESERVED_THEME_IDS, id).toContain(id);
    }
  });

  it.each([
    "inherit",
    "initial",
    "unset",
    "revert",
    "revert-layer",
    "default",
    "none",
    "auto",
    "system",
    "light",
    "dark",
    "constructor",
    "prototype",
  ])("reserves %s", (id) => {
    expect(findAddedThemeIdProblem(id)?.code).toBe("reserved-id");
  });

  it("describes itself as data a browser bundle can embed: a pattern, bounds and a sorted list", () => {
    expect(new RegExp(ADDED_THEME_ID_RULE.pattern).test("acme-co")).toBe(true);
    expect(ADDED_THEME_ID_RULE.minLength).toBe(2);
    expect(ADDED_THEME_ID_RULE.maxLength).toBe(32);
    expect([...ADDED_THEME_ID_RULE.reserved]).toEqual([...RESERVED_THEME_IDS].sort());
    expect(new Set(RESERVED_THEME_IDS).size).toBe(RESERVED_THEME_IDS.length);
  });
});
