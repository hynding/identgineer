import { describe, expect, it } from "vitest";
import { formatDecidedAt } from "./format-decided";

const WHEN = Date.UTC(2026, 2, 1, 12, 30, 0);

describe("formatDecidedAt", () => {
  it("formats the time with Intl.DateTimeFormat in the language it is given", () => {
    const options = { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" } as const;
    expect(formatDecidedAt(WHEN, "en", "UTC")).toBe(
      new Intl.DateTimeFormat("en", options).format(WHEN),
    );
    expect(formatDecidedAt(WHEN, "de", "UTC")).toBe(
      new Intl.DateTimeFormat("de", options).format(WHEN),
    );
    expect(formatDecidedAt(WHEN, "de", "UTC")).not.toBe(formatDecidedAt(WHEN, "en", "UTC"));
  });

  it("falls back to the browser's language for an empty or invalid tag", () => {
    expect(formatDecidedAt(WHEN, "", "UTC")).not.toBe("");
    expect(formatDecidedAt(WHEN, "not a tag!", "UTC")).not.toBe("");
    expect(formatDecidedAt(WHEN, undefined, "UTC")).not.toBe("");
  });

  it("says nothing for a time that is missing, not finite or outside what a date can hold", () => {
    expect(formatDecidedAt(undefined, "en")).toBeUndefined();
    expect(formatDecidedAt(Number.NaN, "en")).toBeUndefined();
    expect(formatDecidedAt(Number.POSITIVE_INFINITY, "en")).toBeUndefined();
    expect(formatDecidedAt(8.64e15 + 1, "en")).toBeUndefined();
    expect(formatDecidedAt("yesterday", "en")).toBeUndefined();
  });
});
