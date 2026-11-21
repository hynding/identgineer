import { describe, expect, it } from "vitest";
import { resolveSelection, type SelectableItem } from "./selection";

const items = (...spec: string[]): SelectableItem[] =>
  spec.map((entry) => ({ value: entry.replace("!", ""), disabled: entry.endsWith("!") }));

describe("resolveSelection", () => {
  it("keeps the requested value when it exists and is enabled", () => {
    expect(resolveSelection(items("a", "b", "c"), "b", 0)).toBe("b");
  });

  it("falls back to the first enabled item when nothing is requested", () => {
    expect(resolveSelection(items("a!", "b", "c"), "", 0)).toBe("b");
  });

  it("moves to the item that took the place of a removed one", () => {
    expect(resolveSelection(items("a", "c", "d"), "b", 1)).toBe("c");
  });

  it("moves back to the last item when the removed one was the last", () => {
    expect(resolveSelection(items("a", "b"), "c", 2)).toBe("b");
  });

  it("treats a selected item that became disabled like a removed one", () => {
    expect(resolveSelection(items("a", "b!", "c"), "b", 1)).toBe("c");
    expect(resolveSelection(items("a", "b", "c!"), "c", 2)).toBe("b");
  });

  it("skips disabled neighbours", () => {
    expect(resolveSelection(items("a", "c!", "d!", "e"), "b", 1)).toBe("e");
  });

  it("returns undefined when nothing can be selected", () => {
    expect(resolveSelection([], "a", 0)).toBeUndefined();
    expect(resolveSelection(items("a!", "b!"), "a", 0)).toBeUndefined();
  });

  it("clamps a remembered position outside the list", () => {
    expect(resolveSelection(items("a", "b"), "", 7)).toBe("b");
    expect(resolveSelection(items("a", "b"), "", -2)).toBe("a");
  });
});
