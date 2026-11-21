import { describe, expect, it } from "vitest";
import { TypeaheadBuffer, typeaheadMatch } from "./typeahead";

const LABELS = ["Copy", "Cut", "Paste", "Delete", "  cancel "];

describe("TypeaheadBuffer", () => {
  it("collects characters typed in quick succession", () => {
    const buffer = new TypeaheadBuffer();
    expect(buffer.push("p", 0)).toBe("p");
    expect(buffer.push("a", 200)).toBe("pa");
  });

  it("starts again after a pause", () => {
    const buffer = new TypeaheadBuffer();
    buffer.push("p", 0);
    expect(buffer.push("d", 501)).toBe("d");
  });
});

describe("typeaheadMatch", () => {
  it("finds the next item after the current one that starts with the text", () => {
    expect(typeaheadMatch(LABELS, 0, "c")).toBe(1);
    expect(typeaheadMatch(LABELS, 1, "c")).toBe(4);
  });

  it("wraps around to the start", () => {
    expect(typeaheadMatch(LABELS, 4, "c")).toBe(0);
  });

  it("matches several characters, ignoring case and surrounding space", () => {
    expect(typeaheadMatch(LABELS, 0, "PA")).toBe(2);
    expect(typeaheadMatch(LABELS, 0, "can")).toBe(4);
  });

  it("cycles through matches when one character is repeated", () => {
    expect(typeaheadMatch(LABELS, 1, "ccc")).toBe(4);
  });

  it("keeps the current item when it is the only match for more than one character", () => {
    expect(typeaheadMatch(LABELS, 2, "pas")).toBe(2);
  });

  it("returns undefined when nothing matches", () => {
    expect(typeaheadMatch(LABELS, 0, "z")).toBeUndefined();
    expect(typeaheadMatch([], -1, "a")).toBeUndefined();
  });
});
