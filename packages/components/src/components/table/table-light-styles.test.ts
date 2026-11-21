import { describe, expect, it } from "vitest";
import { findCssViolations } from "../../../checks/css-rules";
import { TABLE_LIGHT_CSS } from "./table-light-styles";

describe("TABLE_LIGHT_CSS", () => {
  it("uses only --idg-* tokens for colour and motion, as every shipped stylesheet does", () => {
    expect(TABLE_LIGHT_CSS).not.toBe("");
    expect(findCssViolations(TABLE_LIGHT_CSS)).toEqual([]);
  });

  it("sits in a cascade layer, so the page's own css wins", () => {
    expect(TABLE_LIGHT_CSS.trimStart().startsWith("@layer idg.components")).toBe(true);
  });

  it("styles nothing outside idg-table", () => {
    const selectors = TABLE_LIGHT_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/[{}]/)
      .filter((_part, index, parts) => index % 2 === 0 && parts[index + 1] !== undefined)
      .flatMap((part) => part.split(","))
      .map((selector) => selector.trim())
      .filter((selector) => selector !== "" && !selector.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(5);
    expect(selectors.filter((selector) => !selector.startsWith("idg-table"))).toEqual([]);
  });

  it("styles the sort button, its mark and the sticky header", () => {
    expect(TABLE_LIGHT_CSS).toContain(".idg-table-sort");
    expect(TABLE_LIGHT_CSS).toContain(".idg-table-sort-mark");
    expect(TABLE_LIGHT_CSS).toContain("position: sticky");
  });

  it("handles forced colours", () => {
    expect(TABLE_LIGHT_CSS).toContain("@media (forced-colors: active)");
  });
});
