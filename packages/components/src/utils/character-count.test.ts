import { describe, expect, it } from "vitest";
import { characterAnnouncement } from "./character-count";

describe("characterAnnouncement", () => {
  it("is silent while plenty of room is left", () => {
    expect(characterAnnouncement(10, 200)).toBe("");
  });

  it("is silent without a limit", () => {
    expect(characterAnnouncement(10, undefined)).toBe("");
  });

  it("announces the remaining count near the limit", () => {
    expect(characterAnnouncement(185, 200)).toBe("15 characters remaining");
    expect(characterAnnouncement(199, 200)).toBe("1 character remaining");
  });

  it("announces the limit being reached and passed", () => {
    expect(characterAnnouncement(200, 200)).toBe("Character limit reached");
    expect(characterAnnouncement(205, 200)).toBe("5 characters over the limit");
  });
});
