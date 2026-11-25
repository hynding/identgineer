import { describe, expect, it } from "vitest";
import { boundSvgPathData } from "./bound-svg-path-data.ts";

describe("boundSvgPathData", () => {
  it("bounds path data as written by its length and the box of all it can draw", () => {
    const bound = boundSvgPathData("M0 0H10V1e1");
    expect(bound?.length).toBeGreaterThanOrEqual(20);
    expect(bound?.box).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("bounds nothing it does not keep", () => {
    expect(boundSvgPathData("M0 0H10V")).toBeUndefined();
  });
});
