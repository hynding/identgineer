import { describe, expect, it } from "vitest";
import { tokenLifetime } from "./token-lifetime.ts";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const FALLBACK = { fallbackMs: 600_000, now: NOW };

const base64Url = (value: string): string =>
  Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const jwt = (claims: Record<string, unknown>): string =>
  `${base64Url('{"alg":"HS256"}')}.${base64Url(JSON.stringify(claims))}.sig`;

const seconds = (ms: number): number => Math.floor(ms / 1000);

describe("tokenLifetime", () => {
  it("prefers the backend's expiresIn", () => {
    expect(tokenLifetime({ accessToken: "1|opaque", expiresIn: 300 }, FALLBACK)).toEqual({
      ms: 300_000,
      known: true,
    });
  });

  it("takes an expiresIn of up to a year, in whole seconds", () => {
    expect(tokenLifetime({ accessToken: "1|o", expiresIn: 1 }, FALLBACK)).toEqual({
      ms: 1_000,
      known: true,
    });
    expect(tokenLifetime({ accessToken: "1|o", expiresIn: 31_536_000 }, FALLBACK)).toEqual({
      ms: 31_536_000_000,
      known: true,
    });
  });

  it("falls through an unusable expiresIn to the token's own times", () => {
    const token = jwt({ iat: seconds(NOW), exp: seconds(NOW) + 60 });
    expect(tokenLifetime({ accessToken: token, expiresIn: 2.5 }, FALLBACK)).toEqual({
      ms: 60_000,
      known: true,
    });
  });

  it("reads an expiresAt date against the local clock", () => {
    const expiresAt = new Date(NOW + 120_000).toISOString();
    expect(tokenLifetime({ accessToken: "1|opaque", expiresAt }, FALLBACK)).toEqual({
      ms: 120_000,
      known: true,
    });
  });

  it("measures a JWT by exp - iat, whatever the local clock says", () => {
    const skewed = NOW - 3_600_000;
    const token = jwt({ iat: seconds(skewed), exp: seconds(skewed) + 600 });
    expect(tokenLifetime({ accessToken: token }, FALLBACK)).toEqual({ ms: 600_000, known: true });
  });

  it("falls back to exp against the local clock for a JWT without iat", () => {
    const token = jwt({ exp: seconds(NOW) + 90 });
    expect(tokenLifetime({ accessToken: token }, FALLBACK)).toEqual({ ms: 90_000, known: true });
  });

  it.each([
    ["an opaque token", { accessToken: "12|AbCdEf" }],
    [
      "a JWT whose exp has passed by the local clock",
      { accessToken: jwt({ exp: seconds(NOW) - 10 }) },
    ],
    ["a JWT whose exp is not after iat", { accessToken: jwt({ iat: 100, exp: 100 }) }],
    ["a negative expiresIn", { accessToken: "1|o", expiresIn: -5 }],
    ["a zero expiresIn", { accessToken: "1|o", expiresIn: 0 }],
    ["an infinite expiresIn", { accessToken: "1|o", expiresIn: Number.POSITIVE_INFINITY }],
    ["a fractional expiresIn", { accessToken: "1|o", expiresIn: 1.5 }],
    ["an expiresIn of more than a year", { accessToken: "1|o", expiresIn: 31_536_001 }],
    ["a NaN expiresIn", { accessToken: "1|o", expiresIn: Number.NaN }],
    [
      "an expiresAt in the past",
      { accessToken: "1|o", expiresAt: new Date(NOW - 1).toISOString() },
    ],
    ["an unreadable expiresAt", { accessToken: "1|o", expiresAt: "soon" }],
  ])("uses the configured lifetime for %s", (_label, source) => {
    expect(tokenLifetime(source, FALLBACK)).toEqual({ ms: 600_000, known: false });
  });
});
