import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "./retry-after.ts";

const NOW = Date.parse("2026-03-01T12:00:00Z");

describe("parseRetryAfter", () => {
  it.each([
    ["120", 120],
    ["0", 0],
    [" 5 ", 5],
    ["007", 7],
    ["3600", 3600],
    ["99999999", 3600],
    ["99999999999999999999999", 3600],
  ])("reads the seconds in %j as %i", (header, seconds) => {
    expect(parseRetryAfter(header, NOW)).toBe(seconds);
  });

  it("reads an HTTP date as the seconds until it", () => {
    expect(parseRetryAfter("Sun, 01 Mar 2026 12:01:30 GMT", NOW)).toBe(90);
  });

  it("rounds a date up to whole seconds", () => {
    expect(parseRetryAfter("Sun, 01 Mar 2026 12:00:00 GMT", NOW - 1)).toBe(1);
  });

  it("treats a date in the past as no wait", () => {
    expect(parseRetryAfter("Sun, 01 Mar 2026 11:00:00 GMT", NOW)).toBe(0);
  });

  it("caps a far date at an hour", () => {
    expect(parseRetryAfter("Sun, 01 Mar 2037 12:00:00 GMT", NOW)).toBe(3600);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["blanks", "   "],
    ["garbage", "soon"],
    ["a negative number", "-5"],
    ["a fraction", "1.5"],
    ["an exponent", "1e3"],
    ["hexadecimal", "0x10"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["non-ASCII digits", "٣٠"],
    ["a date without words", "2030-01-01"],
    ["a date that is not one", "Someday, 99 Foo 2026 99:99:99 GMT"],
    ["a very long value", `Sun, 01 Mar 2026 12:01:30 GMT${" ".repeat(200)}x`],
  ])("ignores %s", (_label, header) => {
    expect(parseRetryAfter(header, NOW)).toBeUndefined();
  });
});
