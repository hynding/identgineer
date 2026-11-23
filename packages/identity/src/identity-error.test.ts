import { describe, expect, it } from "vitest";
import { IDENTITY_ERROR_CODES, IdentityError } from "./identity-error.ts";

describe("IdentityError", () => {
  it("has a closed set of codes", () => {
    expect([...IDENTITY_ERROR_CODES].sort()).toEqual(
      [
        "email-not-confirmed",
        "invalid-credentials",
        "network",
        "throttled",
        "unauthorized",
        "unknown",
        "validation",
      ].sort(),
    );
  });

  it("is an Error with its code and a fixed message per code", () => {
    const error = new IdentityError("invalid-credentials");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("IdentityError");
    expect(error.code).toBe("invalid-credentials");
    expect(error.message).toBe("The sign-in details are not correct.");
  });

  it("gives every code a message that names no account and no server text", () => {
    const messages = IDENTITY_ERROR_CODES.map((code) => new IdentityError(code).message);
    expect(new Set(messages).size).toBe(IDENTITY_ERROR_CODES.length);
    for (const message of messages) expect(message).not.toMatch(/exist|taken|registered/i);
  });

  it("carries the seconds to wait when throttled", () => {
    const error = new IdentityError("throttled", { retryAfterSeconds: 42 });
    expect(error.retryAfterSeconds).toBe(42);
  });

  it("carries field names for validation", () => {
    const error = new IdentityError("validation", { fields: ["email", "username"] });
    expect(error.fields).toEqual(["email", "username"]);
    expect(Object.isFrozen(error.fields)).toBe(true);
  });

  it("leaves the optional details off when not given", () => {
    const error = new IdentityError("unknown");
    expect("retryAfterSeconds" in error).toBe(false);
    expect("fields" in error).toBe(false);
  });

  it("serialises to its code and details only", () => {
    const error = new IdentityError("throttled", { retryAfterSeconds: 3 });
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "IdentityError",
      code: "throttled",
      retryAfterSeconds: 3,
    });
    expect("cause" in error).toBe(false);
  });
});
