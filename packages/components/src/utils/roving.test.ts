import { describe, expect, it } from "vitest";
import { nextRovingIndex, rovingMove } from "./roving";

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

describe("rovingMove", () => {
  it("moves along the horizontal axis with the horizontal arrows only", () => {
    expect(rovingMove(0, "ArrowRight", ENABLED, "horizontal", false)).toBe(1);
    expect(rovingMove(0, "ArrowLeft", ENABLED, "horizontal", false)).toBe(3);
    expect(rovingMove(0, "ArrowDown", ENABLED, "horizontal", false)).toBeUndefined();
    expect(rovingMove(0, "ArrowUp", ENABLED, "horizontal", false)).toBeUndefined();
  });

  it("moves along the vertical axis with the vertical arrows only", () => {
    expect(rovingMove(0, "ArrowDown", ENABLED, "vertical", false)).toBe(1);
    expect(rovingMove(0, "ArrowUp", ENABLED, "vertical", false)).toBe(3);
    expect(rovingMove(0, "ArrowRight", ENABLED, "vertical", false)).toBeUndefined();
    expect(rovingMove(0, "ArrowLeft", ENABLED, "vertical", false)).toBeUndefined();
  });

  it("moves with the arrows of both axes in a list that answers both", () => {
    expect(rovingMove(0, "ArrowDown", ENABLED, "both", false)).toBe(1);
    expect(rovingMove(0, "ArrowUp", ENABLED, "both", false)).toBe(3);
    expect(rovingMove(0, "ArrowRight", ENABLED, "both", false)).toBe(1);
    expect(rovingMove(0, "ArrowLeft", ENABLED, "both", false)).toBe(3);
    expect(rovingMove(1, "ArrowRight", ENABLED, "both", true)).toBe(0);
    expect(rovingMove(1, "ArrowLeft", ENABLED, "both", true)).toBe(2);
    expect(rovingMove(1, "ArrowDown", ENABLED, "both", true)).toBe(2);
  });

  it("swaps the horizontal arrows in right-to-left text but not the vertical ones", () => {
    expect(rovingMove(1, "ArrowRight", ENABLED, "horizontal", true)).toBe(0);
    expect(rovingMove(1, "ArrowLeft", ENABLED, "horizontal", true)).toBe(2);
    expect(rovingMove(1, "ArrowDown", ENABLED, "vertical", true)).toBe(2);
  });

  it("goes to the first and last enabled item with Home and End, on either axis", () => {
    const enabled = [false, true, true, false];
    expect(rovingMove(2, "Home", enabled, "horizontal", false)).toBe(1);
    expect(rovingMove(1, "End", enabled, "vertical", true)).toBe(2);
  });

  it("skips disabled items and wraps", () => {
    expect(rovingMove(3, "ArrowRight", [true, false, true, true], "horizontal", false)).toBe(0);
    expect(rovingMove(0, "ArrowLeft", [true, false, true, false], "horizontal", false)).toBe(2);
  });

  it("returns undefined for other keys and when no item is enabled", () => {
    expect(rovingMove(0, "a", ENABLED, "horizontal", false)).toBeUndefined();
    expect(rovingMove(0, "Home", [false, false], "horizontal", false)).toBeUndefined();
    expect(rovingMove(0, "End", [], "horizontal", false)).toBeUndefined();
  });
});
