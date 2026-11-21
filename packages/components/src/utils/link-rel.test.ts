import { describe, expect, it } from "vitest";
import { linkRel } from "./link-rel";

describe("linkRel", () => {
  it.each([undefined, "", "_self", "_SELF"])("leaves rel alone for target %j", (target) => {
    expect(linkRel(target, "author")).toBe("author");
    expect(linkRel(target, undefined)).toBeUndefined();
  });

  it.each(["_blank", "_BLANK", "_parent", "_top", "elsewhere"])(
    "adds noopener noreferrer for target %s",
    (target) => {
      expect(linkRel(target, undefined)).toBe("noopener noreferrer");
    },
  );

  it("keeps the author's other tokens, once each", () => {
    expect(linkRel("_blank", "nofollow  NoOpener nofollow")).toBe("nofollow noopener noreferrer");
  });
});
