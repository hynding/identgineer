import { describe, expect, it } from "vitest";
import { IdentityError } from "@identgineer/identity";
import { readIdentityError } from "./identity-error";

describe("readIdentityError", () => {
  it("reads the code, the fields and the wait of the SDK's error", () => {
    expect(readIdentityError(new IdentityError("validation", { fields: ["email"] }))).toEqual({
      code: "validation",
      fields: ["email"],
    });
    expect(readIdentityError(new IdentityError("throttled", { retryAfterSeconds: 30 }))).toEqual({
      code: "throttled",
      fields: [],
      retryAfterSeconds: 30,
    });
  });

  it("treats anything else as unknown and never keeps its message", () => {
    for (const thrown of [new Error("user ada exists"), "text", null, { code: "teapot" }]) {
      expect(readIdentityError(thrown)).toEqual({ code: "unknown", fields: [] });
    }
  });

  it("keeps only string field names and a finite, non-negative wait", () => {
    expect(
      readIdentityError({ code: "validation", fields: ["email", 3, null], retryAfterSeconds: -1 }),
    ).toEqual({ code: "validation", fields: ["email"] });
    expect(readIdentityError({ code: "throttled", retryAfterSeconds: Number.NaN })).toEqual({
      code: "throttled",
      fields: [],
    });
  });
});
