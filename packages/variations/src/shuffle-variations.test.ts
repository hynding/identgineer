import { describe, expect, it } from "vitest";
import { createTestDocument } from "./create-test-document.ts";
import { REGISTRY } from "./registry.ts";
import { shuffleVariations } from "./shuffle-variations.ts";
import { applyVariations } from "./variations-state.ts";

/** A random source that returns the given numbers in order, then repeats the last. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe("shuffleVariations", () => {
  it("picks one variation per axis from the random source", () => {
    const state = shuffleVariations(sequence(0.99, 0.5, 0.26, 0.13));
    expect(state).toEqual({
      theme: "paper",
      design: "outline",
      layout: "split-hero",
      ux: "compact",
      scheme: "system",
    });
  });

  it("is deterministic for a given random source", () => {
    expect(shuffleVariations(sequence(0.3, 0.6, 0.9, 0.2))).toEqual(
      shuffleVariations(sequence(0.3, 0.6, 0.9, 0.2)),
    );
  });

  it("always differs from the current state, even if every pick lands on it", () => {
    const doc = createTestDocument();
    const root = doc.documentElement;
    // Zero picks index 0 on every axis: the defaults, which is what the bare root reports.
    const state = shuffleVariations(() => 0, { root });
    expect(state).not.toEqual({
      theme: "aurora",
      design: "flat",
      layout: "top-bar",
      ux: "comfortable",
      scheme: "system",
    });
    const differing = (["theme", "design", "layout", "ux"] as const).filter(
      (axis) => state[axis] !== REGISTRY[axis].defaultId,
    );
    expect(differing).toHaveLength(1);
  });

  it("compares with the given root, not the defaults", () => {
    const doc = createTestDocument();
    const root = doc.documentElement;
    applyVariations(
      { theme: "paper", design: "editorial", layout: "immersive", ux: "power" },
      { root },
    );
    // 0.99 on every axis picks the last id of each: exactly what the root holds.
    const state = shuffleVariations(() => 0.99, { root });
    expect(state).not.toEqual({
      theme: "paper",
      design: "editorial",
      layout: "immersive",
      ux: "power",
      scheme: "system",
    });
  });

  it("leaves the colour scheme as it is, since it is not one of the four axes", () => {
    const doc = createTestDocument();
    const root = doc.documentElement;
    applyVariations({ scheme: "dark" }, { root });
    expect(shuffleVariations(sequence(0.5), { root }).scheme).toBe("dark");
  });

  it("does not change the root: applying the result is the caller's choice", () => {
    const doc = createTestDocument();
    shuffleVariations(sequence(0.5), { root: doc });
    expect(doc.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("only returns registry ids even when the random source misbehaves", () => {
    for (const value of [-1, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const state = shuffleVariations(() => value);
      for (const axis of ["theme", "design", "layout", "ux"] as const) {
        expect(REGISTRY[axis].variations.map((variation) => variation.id)).toContain(state[axis]);
      }
    }
  });

  it("uses Math.random by default and still returns a different state", () => {
    const doc = createTestDocument();
    const root = doc.documentElement;
    for (let round = 0; round < 20; round += 1) {
      const state = shuffleVariations(undefined, { root });
      expect(state).not.toEqual({
        theme: "aurora",
        design: "flat",
        layout: "top-bar",
        ux: "comfortable",
        scheme: "system",
      });
    }
  });
});
