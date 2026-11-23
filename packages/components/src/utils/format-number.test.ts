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

  it("writes negative zero as zero", () => {
    expect(numberFormatter("en")(-0)).toBe("0");
    expect(numberFormatter("en")(-0.001)).not.toMatch(/^-0$/);
  });

  it("writes a number too small or too large for its digits in scientific notation, never as 0 or 309 digits", () => {
    const format = numberFormatter("en");
    expect(format(5e-324)).toBe("5E-324");
    expect(format(0.004)).toBe("4E-3");
    expect(format(1e308)).toBe("1E308");
    expect(format(-1.5e20)).toBe("-1.5E20");
    expect(format(0.01)).toBe("0.01");
    expect(format(999_999_999_999_999)).toBe("999,999,999,999,999");
  });
});
