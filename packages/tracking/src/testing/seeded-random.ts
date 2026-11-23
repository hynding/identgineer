import type { RandomSource } from "../random-token.ts";

export interface SeededRandom {
  /** Numbers in [0, 1), as `Math.random`, for retry jitter. */
  readonly random: () => number;
  /** Fills byte arrays as `crypto.getRandomValues` does, from the same sequence. */
  readonly crypto: RandomSource;
}

/** A small seeded generator (mulberry32), so a run can be replayed from its seed. */
export const createSeededRandom = (seed: number): SeededRandom => {
  let state = seed >>> 0;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    random,
    crypto: {
      getRandomValues: (array) => {
        for (let index = 0; index < array.length; index += 1) {
          array[index] = Math.floor(random() * 256);
        }
        return array;
      },
    },
  };
};
