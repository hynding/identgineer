import { describe, expect, it } from "vitest";
import { VIEW_HEIGHT, VIEW_WIDTH, sparklineShape } from "./sparkline-geometry";

const numbersIn = (path: string) => [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe("sparklineShape", () => {
  it("draws nothing for no values", () => {
    expect(sparklineShape([])).toEqual({ line: "", area: "", end: undefined });
  });

  it("draws one value as a mark in the middle and no line", () => {
    const shape = sparklineShape([42]);
    expect(shape.line).toBe("");
    expect(shape.area).toBe("");
    expect(shape.end?.x).toBeCloseTo(VIEW_WIDTH / 2);
    expect(shape.end?.y).toBeCloseTo(VIEW_HEIGHT / 2);
  });

  it("draws equal values as a level line in the middle", () => {
    const shape = sparklineShape([5, 5, 5, 5]);
    const ys = numbersIn(shape.line).filter((_, index) => index % 2 === 1);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBeCloseTo(VIEW_HEIGHT / 2);
  });

  it("puts a higher value higher up, which is a smaller y", () => {
    const shape = sparklineShape([1, 2, 3]);
    const ys = numbersIn(shape.line).filter((_, index) => index % 2 === 1);
    expect(ys[0]).toBeGreaterThan(ys[1] ?? 0);
    expect(ys[1]).toBeGreaterThan(ys[2] ?? 0);
  });

  it("starts at the left padding and ends at the right, with the end mark on the last point", () => {
    const shape = sparklineShape([1, 3, 2]);
    const xs = numbersIn(shape.line).filter((_, index) => index % 2 === 0);
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs[xs.length - 1]).toBeLessThan(VIEW_WIDTH);
    expect(shape.end?.x).toBeCloseTo(xs[xs.length - 1] ?? 0);
  });

  it("closes the area down to the baseline", () => {
    const shape = sparklineShape([1, 3, 2]);
    expect(shape.area.startsWith(shape.line)).toBe(true);
    expect(shape.area.endsWith("Z")).toBe(true);
  });

  it("keeps every coordinate inside the view box for negative, huge and tiny values", () => {
    for (const values of [
      [-5, -1, -3],
      [Number.MAX_VALUE, -Number.MAX_VALUE, 0],
      [1e-300, 2e-300, 1.5e-300],
      [0, 1e15, 2],
    ]) {
      const shape = sparklineShape(values);
      expect(shape.line).not.toMatch(/NaN|Infinity|e[+-]/);
      for (const [index, value] of numbersIn(shape.area).entries()) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(index % 2 === 0 ? VIEW_WIDTH : VIEW_HEIGHT);
      }
    }
  });

  it("writes no more than two decimals", () => {
    expect(sparklineShape([1, 1.123456789, 3.987654321, 2]).line).not.toMatch(/\.\d{3}/);
  });
});
