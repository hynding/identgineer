import { describe, expect, it } from "vitest";
import { DEFAULT_RETRY_AFTER_SECONDS, parseRetryAfter } from "./retry-after.ts";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

describe("parseRetryAfter", () => {
  it("reads delay seconds", () => {
    expect(parseRetryAfter("42", NOW)).toBe(42);
  });

  it("reads an HTTP date, rounding up", () => {
    expect(parseRetryAfter("Thu, 01 Jan 2026 12:00:30 GMT", NOW)).toBe(30);
    expect(parseRetryAfter(new Date(NOW + 1500).toUTCString(), NOW - 500)).toBe(2);
  });

  it("falls back to the throttle window when the header is missing or unreadable", () => {
    expect(DEFAULT_RETRY_AFTER_SECONDS).toBe(60);
    expect(parseRetryAfter(null, NOW)).toBe(60);
    expect(parseRetryAfter("soon", NOW)).toBe(60);
    expect(parseRetryAfter("-5", NOW)).toBe(60);
    expect(parseRetryAfter("1.5", NOW)).toBe(60);
  });

  it("waits at least one second and at most an hour", () => {
    expect(parseRetryAfter("0", NOW)).toBe(1);
    expect(parseRetryAfter("Thu, 01 Jan 2026 11:00:00 GMT", NOW)).toBe(1);
    expect(parseRetryAfter("999999", NOW)).toBe(3600);
  });
});
