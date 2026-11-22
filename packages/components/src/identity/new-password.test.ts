import { describe, expect, it } from "vitest";
import { newPasswordErrors } from "./new-password";

const LABELS = {
  newPasswordRequired: "required",
  passwordTooLong: "too long",
  passwordMismatch: "mismatch",
};

describe("newPasswordErrors", () => {
  it("accepts a password typed the same twice within 72 bytes", () => {
    expect(newPasswordErrors("é".repeat(36), "é".repeat(36), LABELS)).toEqual({});
  });

  it("marks a missing password, then one over 72 bytes, on the password", () => {
    expect(newPasswordErrors("", "", LABELS)).toEqual({ password: "required" });
    expect(newPasswordErrors("é".repeat(37), "é".repeat(37), LABELS)).toEqual({
      password: "too long",
    });
    expect(newPasswordErrors("é".repeat(37), "other", LABELS)).toEqual({
      password: "too long",
      passwordConfirmation: "mismatch",
    });
  });

  it("marks a confirmation that differs on the confirmation", () => {
    expect(newPasswordErrors("one password", "another", LABELS)).toEqual({
      passwordConfirmation: "mismatch",
    });
  });
});
