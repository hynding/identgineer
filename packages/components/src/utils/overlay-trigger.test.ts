import { describe, expect, it } from "vitest";
import { applyDescription, applyExpanded, isTriggerControl } from "./overlay-trigger";

const controls = { id: "surface" } as unknown as Element;

describe("isTriggerControl", () => {
  it("accepts an element that implements the trigger protocol", () => {
    expect(isTriggerControl({ accessibleExpanded: undefined })).toBe(true);
  });

  it("rejects a native element", () => {
    expect(isTriggerControl({ ariaExpanded: null })).toBe(false);
  });
});

describe("applyExpanded", () => {
  it("hands the state to a control that applies it in its own root", () => {
    const trigger = {
      accessibleExpanded: undefined as boolean | undefined,
      accessibleHaspopup: undefined as string | undefined,
      accessibleControls: undefined as Element[] | undefined,
    };
    applyExpanded(trigger as unknown as Element, { expanded: true, popup: "menu", controls });
    expect(trigger).toEqual({
      accessibleExpanded: true,
      accessibleHaspopup: "menu",
      accessibleControls: [controls],
    });
  });

  it("sets the ARIA properties of a native element", () => {
    const trigger = { ariaExpanded: null, ariaHasPopup: null, ariaControlsElements: null };
    applyExpanded(trigger as unknown as Element, { expanded: false, popup: "menu", controls });
    expect(trigger).toEqual({
      ariaExpanded: "false",
      ariaHasPopup: "menu",
      ariaControlsElements: [controls],
    });
  });

  it("clears everything it set", () => {
    const native = { ariaExpanded: "true", ariaHasPopup: "menu", ariaControlsElements: [controls] };
    applyExpanded(native as unknown as Element, undefined);
    expect(native).toEqual({ ariaExpanded: null, ariaHasPopup: null, ariaControlsElements: null });
    const control = {
      accessibleExpanded: true,
      accessibleHaspopup: "menu",
      accessibleControls: [controls],
    };
    applyExpanded(control as unknown as Element, undefined);
    expect(control).toEqual({
      accessibleExpanded: undefined,
      accessibleHaspopup: undefined,
      accessibleControls: undefined,
    });
  });

  it("leaves aria-haspopup alone for a disclosure", () => {
    const trigger = { ariaExpanded: null, ariaHasPopup: null, ariaControlsElements: null };
    applyExpanded(trigger as unknown as Element, { expanded: true, controls });
    expect(trigger.ariaHasPopup).toBeNull();
  });
});

describe("applyDescription", () => {
  it("hands the text to a control", () => {
    const trigger = { accessibleExpanded: undefined, accessibleDescription: undefined };
    applyDescription(trigger as unknown as Element, "Copies the link");
    expect(trigger.accessibleDescription).toBe("Copies the link");
  });

  it("sets aria-description on a native element, as a string property", () => {
    const trigger = { ariaDescription: null as string | null };
    applyDescription(trigger as unknown as Element, "Copies the link");
    expect(trigger.ariaDescription).toBe("Copies the link");
    applyDescription(trigger as unknown as Element, undefined);
    expect(trigger.ariaDescription).toBeNull();
  });
});
