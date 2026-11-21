import { describe, expect, it } from "vitest";
import { nextRovingIndex } from "./roving";

const ENABLED = [true, true, true, true];

describe("nextRovingIndex", () => {
  it.each([
    ["ArrowDown", 1],
    ["ArrowRight", 1],
    ["ArrowUp", 3],
    ["ArrowLeft", 3],
  ])("%s from the first item goes to %i, wrapping around", (key, expected) => {
    expect(nextRovingIndex(0, key, ENABLED, false)).toBe(expected);
  });

  it("wraps forward from the last item", () => {
    expect(nextRovingIndex(3, "ArrowDown", ENABLED, false)).toBe(0);
  });

  it("skips disabled items", () => {
    expect(nextRovingIndex(0, "ArrowDown", [true, false, false, true], false)).toBe(3);
    expect(nextRovingIndex(0, "ArrowUp", [true, false, false, true], false)).toBe(3);
  });

  it("swaps the horizontal arrows in right-to-left text", () => {
    expect(nextRovingIndex(1, "ArrowRight", ENABLED, true)).toBe(0);
    expect(nextRovingIndex(1, "ArrowLeft", ENABLED, true)).toBe(2);
    expect(nextRovingIndex(1, "ArrowDown", ENABLED, true)).toBe(2);
  });

  it("ignores other keys", () => {
    expect(nextRovingIndex(1, "a", ENABLED, false)).toBeUndefined();
  });

  it("returns undefined when nothing else can take focus", () => {
    expect(nextRovingIndex(0, "ArrowDown", [true, false], false)).toBeUndefined();
  });
});
