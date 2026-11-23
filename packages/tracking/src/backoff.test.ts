import { describe, expect, it } from "vitest";
import { backoffDelay, retryDelay } from "./backoff.ts";

describe("backoffDelay", () => {
  it("doubles from a second and jitters between half and all of each step", () => {
    expect([1, 2, 3, 4].map((attempt) => backoffDelay(attempt, () => 0))).toEqual([
      500, 1000, 2000, 4000,
    ]);
    expect([1, 2, 3, 4].map((attempt) => backoffDelay(attempt, () => 1))).toEqual([
      1000, 2000, 4000, 8000,
    ]);
  });

  it("uses the random source for where in the step it lands", () => {
    expect(backoffDelay(3, () => 0.5)).toBe(3000);
  });

  it("is capped at five minutes however many attempts failed", () => {
    expect(backoffDelay(20, () => 1)).toBe(300_000);
    expect(backoffDelay(5000, () => 1)).toBe(300_000);
    expect(backoffDelay(5000, () => 0)).toBe(150_000);
  });

  it("treats an attempt below one as the first", () => {
    expect(backoffDelay(0, () => 1)).toBe(1000);
    expect(backoffDelay(-3, () => 1)).toBe(1000);
    expect(backoffDelay(Number.NaN, () => 1)).toBe(1000);
  });

  it.each([Number.NaN, Infinity, -Infinity, -1, 7])(
    "keeps the delay inside its step when the random source answers %s",
    (answer) => {
      const delay = backoffDelay(2, () => answer);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(2000);
    },
  );
});

describe("retryDelay", () => {
  it("waits as long as the server asked when that is longer than the backoff", () => {
    expect(retryDelay(1, 120, () => 0)).toBe(120_000);
  });

  it("keeps the backoff when the server asked for less", () => {
    expect(retryDelay(4, 1, () => 1)).toBe(8000);
  });

  it("uses the backoff alone when the server said nothing usable", () => {
    expect(retryDelay(2, undefined, () => 1)).toBe(2000);
  });

  it("never waits more than an hour on the server's word", () => {
    expect(retryDelay(1, 999_999, () => 0)).toBe(3_600_000);
  });
});
