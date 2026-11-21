import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["ada lovelace", "AL"],
    ["Grace Brewster Murray Hopper", "GH"],
    ["Ada", "A"],
    ["  Ada   Lovelace  ", "AL"],
    ["Jean-Luc Picard", "JP"],
    ["Émile Zola", "ÉZ"],
    ["Łukasz Nowak", "ŁN"],
    ["李 明", "李明"],
    ["O'Brien", "O"],
    ["(admin) Sam", "AS"],
    ["42 Club", "4C"],
  ])("takes the first letter of the first and last word of %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it.each(["", "   ", "---", "!!! ???", undefined])("is empty for %j", (name) => {
    expect(initials(name)).toBe("");
  });

  it("keeps a letter outside the basic plane whole", () => {
    expect(Array.from(initials("𝒜da 𝒷ob"))).toHaveLength(2);
  });
});
