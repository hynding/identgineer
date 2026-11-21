import { describe, expect, it } from "vitest";
import { allows } from "./authorize";
import { OWNER_CONDITION, type Role } from "./model";

const role: Role = {
  name: "authenticated",
  grants: [
    { contentType: "Note", actions: ["read"], condition: OWNER_CONDITION },
    { contentType: "Tag", actions: ["read"] },
  ],
};

describe("allows", () => {
  it("allows an unconditioned grant's action", () => {
    expect(allows(role, "Tag", "read")).toBe(true);
  });

  it("denies an action no grant lists", () => {
    expect(allows(role, "Tag", "delete")).toBe(false);
  });

  it("denies a type no grant names", () => {
    expect(allows(role, "Secret", "read")).toBe(false);
  });

  it("allows a conditioned grant when its condition holds", () => {
    expect(allows(role, "Note", "read", { "user.id": 1, "record.ownerId": 1 })).toBe(true);
  });

  it("denies a conditioned grant when its condition fails", () => {
    expect(allows(role, "Note", "read", { "user.id": 1, "record.ownerId": 2 })).toBe(false);
  });

  it("denies a conditioned grant when a variable it reads is absent", () => {
    expect(allows(role, "Note", "read", { "record.ownerId": 1 })).toBe(false);
  });
});
