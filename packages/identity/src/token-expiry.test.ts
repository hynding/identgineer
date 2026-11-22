import { describe, expect, it } from "vitest";
import { readTokenExpiry } from "./token-expiry.ts";

const base64Url = (value: string): string =>
  Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const jwt = (payload: string): string =>
  `${base64Url('{"alg":"HS256"}')}.${base64Url(payload)}.sig`;

describe("readTokenExpiry", () => {
  it("reads exp from a JWT payload as milliseconds", () => {
    expect(readTokenExpiry(jwt('{"id":1,"exp":1700000000}'))).toBe(1_700_000_000_000);
  });

  it("reads a payload that needs base64url characters", () => {
    expect(readTokenExpiry(jwt('{"exp":1700000000,"n":"\\u00ff\\u00fe>>>???"}'))).toBe(
      1_700_000_000_000,
    );
  });

  it.each([
    ["an opaque Sanctum token", "12|AbCdEf0123456789"],
    ["an empty string", ""],
    ["two segments", "a.b"],
    ["a payload that is not base64", "a.@@@.c"],
    ["a payload that is not JSON", `a.${base64Url("nope")}.c`],
    ["a payload without exp", jwt('{"id":1}')],
    ["a string exp", jwt('{"exp":"1700000000"}')],
    ["a negative exp", jwt('{"exp":-1}')],
    ["an infinite exp", jwt('{"exp":1e400}')],
    ["a polluting payload", jwt('{"__proto__":{"exp":1}}')],
    ["an array payload", jwt("[1700000000]")],
  ])("returns undefined for %s", (_label, token) => {
    expect(readTokenExpiry(token)).toBeUndefined();
  });
});
