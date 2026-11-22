import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect.ts";

describe("safeRedirectPath", () => {
  it.each(["/", "/account", "/account/settings?tab=profile#top", "/a/b-c_d.e"])(
    "keeps the same-origin path %j",
    (path) => {
      expect(safeRedirectPath(path)).toBe(path);
    },
  );

  it.each([
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/path\\with",
    "https://evil.example",
    "javascript:alert(1)",
    "account",
    "",
    " /account",
    "/account\n",
    "/acc\u0000ount",
    "/acc\tount",
    "/%2F%2Fevil.example",
    "/%5Cevil.example",
    "/ ",
  ])("refuses %j and falls back to /", (path) => {
    expect(safeRedirectPath(path)).toBe("/");
  });

  it("falls back to a given default", () => {
    expect(safeRedirectPath(undefined, "/home")).toBe("/home");
    expect(safeRedirectPath("//x", "/home")).toBe("/home");
  });

  it("refuses an unsafe default", () => {
    expect(safeRedirectPath("//x", "//y")).toBe("/");
  });
});
