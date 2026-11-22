import { describe, expect, it } from "vitest";
import { readTokenTimes } from "./token-expiry.ts";

const base64Url = (value: string): string =>
  Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const jwt = (payload: string): string =>
  `${base64Url('{"alg":"HS256"}')}.${base64Url(payload)}.sig`;

describe("readTokenTimes", () => {
  it("reads exp from a JWT payload as milliseconds", () => {
    expect(readTokenTimes(jwt('{"id":1,"exp":1700000000}'))).toEqual({
      expiresAt: 1_700_000_000_000,
    });
  });

  it("reads iat beside exp", () => {
    expect(readTokenTimes(jwt('{"iat":1699999400,"exp":1700000000}'))).toEqual({
      issuedAt: 1_699_999_400_000,
      expiresAt: 1_700_000_000_000,
    });
  });

  it("drops an unreadable iat but keeps exp", () => {
    expect(readTokenTimes(jwt('{"iat":"x","exp":1700000000}'))).toEqual({
      expiresAt: 1_700_000_000_000,
    });
  });

  it("reads a payload that needs base64url characters", () => {
    expect(readTokenTimes(jwt('{"exp":1700000000,"n":"\\u00ff\\u00fe>>>???"}'))).toEqual({
      expiresAt: 1_700_000_000_000,
    });
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
  ])("reads no expiry from %s", (_label, token) => {
    expect(readTokenTimes(token).expiresAt).toBeUndefined();
  });
});
