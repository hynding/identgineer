import { describe, expect, it } from "vitest";
import { createSeededRandom } from "./seeded-random.ts";

describe("createSeededRandom", () => {
  it("answers numbers in [0, 1) and repeats for the same seed", () => {
    const first = createSeededRandom(7);
    const again = createSeededRandom(7);
    const numbers = Array.from({ length: 50 }, () => first.random());
    expect(numbers.every((number) => number >= 0 && number < 1)).toBe(true);
    expect(Array.from({ length: 50 }, () => again.random())).toEqual(numbers);
    expect(createSeededRandom(8).random()).not.toBe(numbers[0]);
  });

  it("fills byte arrays as crypto.getRandomValues does, differently each time", () => {
    const { crypto } = createSeededRandom(1);
    const seen = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      const bytes = new Uint8Array(16);
      expect(crypto.getRandomValues(bytes)).toBe(bytes);
      seen.add(bytes.join(","));
    }
    expect(seen.size).toBe(500);
  });
});
