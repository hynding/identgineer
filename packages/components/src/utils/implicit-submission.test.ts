import { describe, expect, it } from "vitest";
import { asksForImplicitSubmission, type ImplicitSubmissionKey } from "./implicit-submission";

const ENTER: ImplicitSubmissionKey = {
  key: "Enter",
  isTrusted: true,
  isComposing: false,
  defaultPrevented: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
};

describe("asksForImplicitSubmission", () => {
  it("is Enter the user pressed, with or without Shift", () => {
    expect(asksForImplicitSubmission(ENTER)).toBe(true);
  });

  it("is not a key a script dispatched, as a native input ignores it", () => {
    expect(asksForImplicitSubmission({ ...ENTER, isTrusted: false })).toBe(false);
  });

  it("is not another key, nor Enter while composing or once cancelled", () => {
    expect(asksForImplicitSubmission({ ...ENTER, key: "a" })).toBe(false);
    expect(asksForImplicitSubmission({ ...ENTER, isComposing: true })).toBe(false);
    expect(asksForImplicitSubmission({ ...ENTER, defaultPrevented: true })).toBe(false);
  });

  it("is not Enter with Control, Alt or Meta held, as in Chromium", () => {
    expect(asksForImplicitSubmission({ ...ENTER, ctrlKey: true })).toBe(false);
    expect(asksForImplicitSubmission({ ...ENTER, altKey: true })).toBe(false);
    expect(asksForImplicitSubmission({ ...ENTER, metaKey: true })).toBe(false);
  });
});
