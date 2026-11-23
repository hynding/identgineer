import { describe, expect, it } from "vitest";
import { numberFormatter } from "./format-number";

describe("numberFormatter", () => {
  it("formats with Intl.NumberFormat in the language it is given, to at most two decimals", () => {
    expect(numberFormatter("en")(1234.5678)).toBe("1,234.57");
    expect(numberFormatter("de")(1234.5)).toBe("1.234,5");
  });

  it("falls back to the browser's language for an empty tag, a tag it refuses, and none", () => {
    for (const language of ["", "not a tag!", undefined]) {
      expect(numberFormatter(language)(12)).toBe("12");
    }
  });

  it("writes a number that is not finite as it would be written, never throwing", () => {
    expect(() => numberFormatter("en")(Number.NaN)).not.toThrow();
  });
});
