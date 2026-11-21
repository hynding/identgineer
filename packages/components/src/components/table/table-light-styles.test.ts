import { describe, expect, it } from "vitest";
import { findCssViolations } from "../../../checks/css-rules";
import { TABLE_LIGHT_CSS } from "./table-light-styles";

// Splits a selector list at its top-level commas, leaving those inside :is() and the like.
function splitSelectors(prelude: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of prelude) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      selectors.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  selectors.push(current.trim());
  return selectors;
}

describe("TABLE_LIGHT_CSS", () => {
  it("uses only --idg-* tokens for colour and motion, as every shipped stylesheet does", () => {
    expect(TABLE_LIGHT_CSS).not.toBe("");
    expect(findCssViolations(TABLE_LIGHT_CSS)).toEqual([]);
  });

  it("sits in a cascade layer, so the page's own css wins", () => {
    expect(TABLE_LIGHT_CSS.trimStart().startsWith("@layer idg.components")).toBe(true);
  });

  it("styles nothing outside idg-table", () => {
    const css = TABLE_LIGHT_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = Array.from(css.matchAll(/([^{};]+)\{/g))
      .map((match) => (match[1] ?? "").trim())
      .filter((prelude) => !prelude.startsWith("@"))
      .flatMap(splitSelectors);
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
