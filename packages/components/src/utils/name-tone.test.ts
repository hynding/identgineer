import { describe, expect, it } from "vitest";
import { nameTone, NAME_TONES } from "./name-tone";

describe("nameTone", () => {
  it("is the same for the same name every time", () => {
    expect(nameTone("Ada Lovelace")).toBe(nameTone("Ada Lovelace"));
  });

  it("ignores case and surrounding space, so a name that is typed differently keeps its colour", () => {
    expect(nameTone("  ada LOVELACE ")).toBe(nameTone("Ada Lovelace"));
  });

  it("always lands inside the tones that exist", () => {
    for (const name of ["", "a", "Ada", "李 明", "Grace Hopper", "x".repeat(500)]) {
      const tone = nameTone(name);
      expect(Number.isInteger(tone)).toBe(true);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(NAME_TONES);
    }
  });

  it("is fixed for known names, so a change of the hash is noticed", () => {
    expect(["Ada Lovelace", "Grace Hopper", "Alan Turing"].map(nameTone)).toEqual([4, 3, 2]);
  });

  it("uses every tone over a spread of names", () => {
    const names = Array.from({ length: 120 }, (_, index) => `Person ${String(index)}`);
    expect(new Set(names.map(nameTone)).size).toBe(NAME_TONES);
  });
});
