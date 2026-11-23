import { describe, expect, it } from "vitest";
import { MAX_INPUT_VALUES, downsample, parseValues, summarise } from "./sparkline-values";

describe("parseValues", () => {
  it("takes an array of numbers as it is", () => {
    expect(parseValues([1, 2.5, -3])).toEqual([1, 2.5, -3]);
  });

  it("drops what is not a finite number, and does not turn it into zero", () => {
    expect(
      parseValues([1, Number.NaN, "2", null, undefined, Number.POSITIVE_INFINITY, {}, [3], 4, 10n]),
    ).toEqual([1, 4]);
  });

  it("reads a JSON array in a string, as an attribute gives it", () => {
    expect(parseValues("[1, 2, 3.5, -4e2]")).toEqual([1, 2, 3.5, -400]);
    expect(parseValues(' [1,"2",null,3] ')).toEqual([1, 3]);
  });

  it("reads comma separated numbers, with or without spaces", () => {
    expect(parseValues("1,2, 3 ,4.5,-6")).toEqual([1, 2, 3, 4.5, -6]);
  });

  it("skips empty entries and entries that are not plain decimal numbers, rather than reading them as zero", () => {
    expect(parseValues("1,,2, ,abc,NaN,Infinity,-Infinity,0x10,1e3,.5,3")).toEqual([
      1, 2, 1000, 0.5, 3,
    ]);
  });

  it("is empty for text that is JSON but not an array, and for broken JSON", () => {
    for (const text of ['{"a":1}', "[1,2", "[", "null", "", "   ", "[[1,2]]"]) {
      expect(parseValues(text), text).toEqual([]);
    }
  });

  it("reads a lone number as one value", () => {
    expect(parseValues("7")).toEqual([7]);
  });

  it("is empty for anything else", () => {
    for (const value of [undefined, null, 5, true, {}, () => [1]]) {
      expect(parseValues(value)).toEqual([]);
    }
  });

  it("reads no more of a string than it needs, so a huge attribute costs little", () => {
    const text = Array.from({ length: 500_000 }, (_, index) => String(index)).join(",");
    const start = performance.now();
    const values = parseValues(text);
    expect(values.length).toBeLessThanOrEqual(MAX_INPUT_VALUES);
    expect(values[0]).toBe(0);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("keeps the first, the last, the lowest and the highest of an array that is longer than it reads", () => {
    const long = Array.from({ length: MAX_INPUT_VALUES * 3 }, (_, index) => index);
    const values = parseValues(long);
    expect(values.length).toBeLessThanOrEqual(MAX_INPUT_VALUES);
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBe(MAX_INPUT_VALUES * 3 - 1);
  });
});

describe("summarise", () => {
  it("gives the first, last, lowest and highest, and a rising trend", () => {
    expect(summarise([3, 1, 5, 4])).toEqual({
      count: 4,
      first: 3,
      last: 4,
      lowest: 1,
      highest: 5,
      trend: "rising",
    });
  });

  it("says falling when the last is below the first, and steady when they are equal", () => {
    expect(summarise([5, 9, 2]).trend).toBe("falling");
    expect(summarise([5, 9, 5]).trend).toBe("steady");
    expect(summarise([2, 2, 2]).trend).toBe("steady");
  });

  it("calls one value steady, and has nothing to say about no values", () => {
    expect(summarise([7])).toEqual({
      count: 1,
      first: 7,
      last: 7,
      lowest: 7,
      highest: 7,
      trend: "steady",
    });
    expect(summarise([])).toBeUndefined();
  });

  it("handles negative values and extremes without overflow", () => {
    expect(summarise([-5, -1]).trend).toBe("rising");
    expect(summarise([Number.MAX_VALUE, -Number.MAX_VALUE]).trend).toBe("falling");
  });
});

describe("downsample", () => {
  it("leaves values at or under the limit alone", () => {
    expect(downsample([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it("keeps no more than the limit, in order, with the first, the last, the lowest and the highest", () => {
    const values = Array.from({ length: 100_000 }, (_, index) => Math.sin(index / 50));
    values[12_345] = 99;
    values[67_890] = -99;
    const kept = downsample(values, 100);
    expect(kept.length).toBeLessThanOrEqual(100);
    expect(kept[0]).toBe(values[0]);
    expect(kept[kept.length - 1]).toBe(values[values.length - 1]);
    expect(kept).toContain(99);
    expect(kept).toContain(-99);
    // Still in the order they came: 99 is met before -99.
    expect(kept.indexOf(99)).toBeLessThan(kept.indexOf(-99));
  });

  it("works for a limit as small as two", () => {
    expect(downsample([1, 9, 2, 3, 4], 2)).toEqual([1, 4]);
    expect(downsample([1, 2, 3], 1)).toEqual([3]);
  });

  it("is fast for a million values", () => {
    const values = Array.from({ length: 1_000_000 }, (_, index) => index % 97);
    const start = performance.now();
    expect(downsample(values, 120).length).toBeLessThanOrEqual(120);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
