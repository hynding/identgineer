import { describe, expect, it } from "vitest";
import { applyFieldState, isFieldControl } from "./field-control";

describe("isFieldControl", () => {
  it("accepts an element that implements the protocol", () => {
    expect(isFieldControl({ accessibleLabel: undefined })).toBe(true);
  });

  it("rejects an element without it", () => {
    expect(isFieldControl({})).toBe(false);
  });
});

describe("applyFieldState", () => {
  it("passes the label, description and invalid state down", () => {
    const control = {
      accessibleLabel: undefined,
      accessibleDescription: undefined,
      invalid: false,
    };
    applyFieldState(control, { label: "Email", description: "We never share it", invalid: true });
    expect(control).toEqual({
      accessibleLabel: "Email",
      accessibleDescription: "We never share it",
      invalid: true,
    });
  });

  it("marks the control required only when the field is", () => {
    const control = { accessibleLabel: undefined, required: false };
    applyFieldState(control, { label: "A", description: "", invalid: false, required: true });
    expect(control.required).toBe(true);
    applyFieldState(control, { label: "A", description: "", invalid: false });
    expect(control.required).toBe(true);
  });

  it("clears an empty label or description to undefined", () => {
    const control = { accessibleLabel: "old", accessibleDescription: "old" };
    applyFieldState(control, { label: "", description: "", invalid: false });
    expect(control.accessibleLabel).toBeUndefined();
    expect(control.accessibleDescription).toBeUndefined();
  });
});
