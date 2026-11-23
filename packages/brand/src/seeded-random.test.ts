import { describe, expect, it } from "vitest";
import { seeded } from "./seeded-random.ts";

describe("seeded", () => {
  it("repeats the same sequence for the same seed and differs for another", () => {
    const first = seeded(42);
    const again = seeded(42);
    const other = seeded(43);
    const a = [first(), first(), first()];
    expect([again(), again(), again()]).toEqual(a);
    expect([other(), other(), other()]).not.toEqual(a);
  });

  it("stays within [0, 1)", () => {
    const random = seeded(7);
    for (let index = 0; index < 10_000; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
