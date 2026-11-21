import { describe, expect, it } from "vitest";
import { slottedText } from "./slot-text";

function child(slot: string | null, textContent: string) {
  return { getAttribute: () => slot, textContent };
}

describe("slottedText", () => {
  it("joins the text of the children assigned to a named slot", () => {
    const host = { children: [child("hint", " One "), child("label", "L"), child("hint", "two")] };
    expect(slottedText(host, "hint")).toBe("One two");
  });

  it("reads the default slot from children with no slot attribute", () => {
    const host = { children: [child(null, "A"), child("hint", "B")] };
    expect(slottedText(host, null)).toBe("A");
  });

  it("collapses whitespace and is empty without matching children", () => {
    expect(slottedText({ children: [child("x", "a \n  b")] }, "x")).toBe("a b");
    expect(slottedText({ children: [] }, "x")).toBe("");
  });
});
