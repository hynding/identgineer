import { describe, expect, it } from "vitest";
import { validityFlags } from "./validity";

const VALID = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valueMissing: false,
};

describe("validityFlags", () => {
  it("copies every flag of a validity state", () => {
    expect(validityFlags({ ...VALID, tooShort: true, valueMissing: true })).toEqual({
      ...VALID,
      tooShort: true,
      valueMissing: true,
    });
  });

  it("drops the aggregate valid flag, which setValidity derives itself", () => {
    expect(validityFlags({ ...VALID, valid: true })).not.toHaveProperty("valid");
  });
});
