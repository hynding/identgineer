import { describe, expect, it } from "vitest";
import { reflectControls, reflectLabelledBy } from "./aria-reflection";

const element = (extra: object = {}) => extra as unknown as Element;

describe("reflectControls", () => {
  it("sets the controlled elements where the browser reflects them", () => {
    const target = element();
    const source = { ariaControlsElements: null as Element[] | null };
    reflectControls(source as unknown as Element, [target]);
    expect(source.ariaControlsElements).toEqual([target]);
  });

  it("clears them with null", () => {
    const source = { ariaControlsElements: [element()] as Element[] | null };
    reflectControls(source as unknown as Element, null);
    expect(source.ariaControlsElements).toBeNull();
  });

  it("does nothing where the browser has no reflection", () => {
    const source = {};
    reflectControls(source as unknown as Element, [element()]);
    expect(source).toEqual({});
  });
});

describe("reflectLabelledBy", () => {
  it("sets and clears the labelling elements", () => {
    const label = element();
    const source = { ariaLabelledByElements: null as Element[] | null };
    reflectLabelledBy(source as unknown as Element, [label]);
    expect(source.ariaLabelledByElements).toEqual([label]);
    reflectLabelledBy(source as unknown as Element, null);
    expect(source.ariaLabelledByElements).toBeNull();
  });

  it("does nothing where the browser has no reflection", () => {
    const source = {};
    reflectLabelledBy(source as unknown as Element, [element()]);
    expect(source).toEqual({});
  });
});
