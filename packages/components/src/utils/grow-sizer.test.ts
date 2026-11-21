import { describe, expect, it } from "vitest";
import { growSizerText } from "./grow-sizer";

describe("growSizerText", () => {
  it("keeps the value and adds a line so a trailing newline is measured", () => {
    expect(growSizerText("a\nb", 1)).toBe("a\nb\n");
  });

  it("pads up to the minimum number of rows", () => {
    expect(growSizerText("a", 3).split("\n")).toHaveLength(4);
  });

  it("does not pad a value already taller than the rows", () => {
    expect(growSizerText("a\nb\nc\nd", 2)).toBe("a\nb\nc\nd\n");
  });

  it("treats a missing or invalid row count as one", () => {
    expect(growSizerText("", 0)).toBe("\n");
    expect(growSizerText("", Number.NaN)).toBe("\n");
  });
});
