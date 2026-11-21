import { describe, expect, it } from "vitest";
import { parseDuration } from "./duration";

describe("parseDuration", () => {
  it.each([
    ["500ms", 500],
    [" 250ms ", 250],
    ["0.5s", 500],
    [".2s", 200],
    ["0ms", 0],
  ])("reads %j as %i milliseconds", (value, expected) => {
    expect(parseDuration(value)).toBe(expected);
  });

  it.each(["", "fast", "500", "-1s", "1e3ms", "calc(1s)"])("refuses %j", (value) => {
    expect(parseDuration(value)).toBeUndefined();
  });
});
