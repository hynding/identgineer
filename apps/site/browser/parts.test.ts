import { describe, expect, it } from "vitest";
import { ENGINE_KEYS, PARTS, fitTag, partProblems } from "./parts";

describe("the browser suite's parts", () => {
  it("are each engine's fit sweep in four, by page, the axe sweep of the looks, the layouts and the rest", () => {
    expect(Object.keys(PARTS)).toEqual([
      "chromium-1",
      "chromium-2",
      "chromium-reference",
      "chromium-gallery",
      "no-calc-size-1",
      "no-calc-size-2",
      "no-calc-size-reference",
      "no-calc-size-gallery",
      "no-style-queries-1",
      "no-style-queries-2",
      "no-style-queries-reference",
      "no-style-queries-gallery",
      "axe",
      "layouts",
      "rest",
    ]);
    expect(PARTS["no-calc-size-2"]).toEqual(["--grep", "@fit-no-calc-size-2"]);
    expect(PARTS.axe).toEqual(["--grep", "@axe"]);
    expect(PARTS.layouts).toEqual(["--grep-invert", `@fit-|@axe`, "layouts.browser"]);
    expect(PARTS.rest).toEqual(["--grep-invert", "@fit-|@axe", "^(?!.*layouts\\.browser)"]);
  });

  it("put the home page and the identity page first in each engine, the components' pages together, the gallery alone, and every other page second", () => {
    for (const engine of ENGINE_KEYS) {
      expect(fitTag(engine, "/")).toBe(`@fit-${engine}-1`);
      expect(fitTag(engine, "/identity/")).toBe(`@fit-${engine}-1`);
      expect(fitTag(engine, "/components/")).toBe(`@fit-${engine}-reference`);
      expect(fitTag(engine, "/components/idg-input/")).toBe(`@fit-${engine}-reference`);
      expect(fitTag(engine, "/variations/")).toBe(`@fit-${engine}-gallery`);
      expect(fitTag(engine, "/docs/theming/")).toBe(`@fit-${engine}-2`);
      expect(fitTag(engine, "404")).toBe(`@fit-${engine}-2`);
    }
  });

  it("are right when they hold every test exactly once", () => {
    expect(partProblems(["a", "b", "c"], { one: ["a", "c"], two: ["b"] })).toEqual([]);
  });

  it("name a test in no part, in two parts, or in a part but not in the suite", () => {
    expect(partProblems(["a", "b", "c"], { one: ["a", "b", "x"], two: ["b"] })).toEqual([
      "x: in one, but not in the whole suite",
      "b: in one, two",
      "c: in no part",
    ]);
  });
});
