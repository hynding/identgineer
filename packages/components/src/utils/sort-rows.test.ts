import { describe, expect, it } from "vitest";
import { compareCellValues, sortedRowOrder } from "./sort-rows";

describe("compareCellValues", () => {
  it("compares numbers as numbers", () => {
    expect(compareCellValues("9", "10")).toBeLessThan(0);
    expect(compareCellValues("10", "9")).toBeGreaterThan(0);
    expect(compareCellValues("-2.5", "1")).toBeLessThan(0);
    expect(compareCellValues("3", "3.0")).toBe(0);
  });

  it("compares text by the reader's alphabet, ignoring case and accents", () => {
    expect(compareCellValues("apple", "Banana")).toBeLessThan(0);
    expect(compareCellValues("Zed", "apple")).toBeGreaterThan(0);
    expect(compareCellValues("é", "f")).toBeLessThan(0);
  });

  it("puts the number inside text in numeric order", () => {
    expect(compareCellValues("item 2", "item 10")).toBeLessThan(0);
  });
});

describe("sortedRowOrder", () => {
  const values = ["b", "10", "a", "9", ""];

  it("returns the original positions in ascending order, empty cells last", () => {
    expect(sortedRowOrder(values, "ascending")).toEqual([3, 1, 2, 0, 4]);
  });

  it("reverses for descending but keeps empty cells last", () => {
    expect(sortedRowOrder(values, "descending")).toEqual([0, 2, 1, 3, 4]);
  });

  it("keeps rows that compare equal in their original order, in both directions", () => {
    const equal = ["x", "y", "x", "y"];
    expect(sortedRowOrder(equal, "ascending")).toEqual([0, 2, 1, 3]);
    expect(sortedRowOrder(equal, "descending")).toEqual([1, 3, 0, 2]);
  });

  it("treats whitespace-only cells as empty", () => {
    expect(sortedRowOrder(["  ", "a"], "ascending")).toEqual([1, 0]);
  });

  it("does not change the input", () => {
    const input = ["b", "a"];
    sortedRowOrder(input, "ascending");
    expect(input).toEqual(["b", "a"]);
  });
});
