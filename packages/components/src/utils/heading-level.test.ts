import { describe, expect, it } from "vitest";
import { headingLevel } from "./heading-level";

describe("headingLevel", () => {
  it.each([1, 2, 3, 4, 5, 6])("keeps %i", (level) => {
    expect(headingLevel(level, 3)).toBe(level);
  });

  it("cuts a fraction", () => {
    expect(headingLevel(2.9, 3)).toBe(2);
  });

  it.each([0, 7, -1, Number.NaN, Number.POSITIVE_INFINITY])("uses the fallback for %f", (level) => {
    expect(headingLevel(level, 4)).toBe(4);
  });

  it("reads a numeric string, as an attribute gives", () => {
    expect(headingLevel("5", 3)).toBe(5);
    expect(headingLevel("x", 3)).toBe(3);
    expect(headingLevel(undefined, 3)).toBe(3);
  });
});
