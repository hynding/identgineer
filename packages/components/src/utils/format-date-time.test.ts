import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format-date-time";

const WHEN = "2026-03-01T12:30:45.000Z";

describe("formatDateTime", () => {
  it("formats with Intl.DateTimeFormat in the language it is given, with the seconds", () => {
    const options = { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" } as const;
    expect(formatDateTime(WHEN, "en", "UTC")).toBe(
      new Intl.DateTimeFormat("en", options).format(Date.parse(WHEN)),
    );
    expect(formatDateTime(WHEN, "de", "UTC")).not.toBe(formatDateTime(WHEN, "en", "UTC"));
  });

  it("falls back to the browser's language for an empty or invalid tag", () => {
    for (const language of ["", "not a tag!", undefined]) {
      expect(formatDateTime(WHEN, language, "UTC")).not.toBe("");
    }
  });

  it("falls back to the browser's zone for a zone it does not know", () => {
    expect(formatDateTime(WHEN, "en", "Not/AZone")).not.toBe("");
    expect(formatDateTime(WHEN, "en", "")).not.toBe("");
  });

  it("says nothing for a time that is not one", () => {
    expect(formatDateTime("yesterday", "en")).toBe("");
    expect(formatDateTime("", "en")).toBe("");
  });
});
