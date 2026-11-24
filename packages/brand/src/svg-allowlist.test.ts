import { describe, expect, it } from "vitest";
import { drawsAsInitial } from "./svg-allowlist.ts";

const NONE: ReadonlySet<string> = new Set();

describe("drawsAsInitial", () => {
  it("takes a margin or padding of zero lengths as the initial value", () => {
    for (const value of ["0", "0px", "+0 -0.0 .0% 00.em", " 0  0 "]) {
      expect(drawsAsInitial("margin", value, NONE), value).toBe(true);
    }
  });

  it("takes nothing else as a zero margin", () => {
    for (const value of ["", "1px", "0 1", "auto", "0px;", "0 . 0", "0.0.0"]) {
      expect(drawsAsInitial("padding-left", value, NONE), value).toBe(false);
    }
  });

  it("reads a long run of zeros that ends badly in time that grows with its length", () => {
    const started = performance.now();
    expect(drawsAsInitial("margin", `${"0".repeat(50_000)}!`, NONE)).toBe(false);
    expect(drawsAsInitial("margin", `.${"00.".repeat(20_000)}!`, NONE)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
