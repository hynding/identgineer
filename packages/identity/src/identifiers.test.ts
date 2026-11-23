import { describe, expect, it } from "vitest";
import { providerSegment, sessionSegment } from "./identifiers.ts";
import { IdentityError } from "./identity-error.ts";

describe("providerSegment", () => {
  it.each(["github", "google", "microsoft", "auth0", "my-provider_2"])("accepts %s", (name) => {
    expect(providerSegment(name)).toBe(name);
  });

  it.each([
    "",
    "GitHub",
    "../admin",
    "git/hub",
    "github?x=1",
    "github#",
    "git%2Fhub",
    "git hub",
    "local",
    "a".repeat(65),
    "-github",
  ])("refuses %j", (name) => {
    expect(() => providerSegment(name)).toThrow(IdentityError);
  });
});

describe("sessionSegment", () => {
  it("accepts a hex session id", () => {
    expect(sessionSegment("0123456789abcdef0123456789abcdef")).toBe(
      "0123456789abcdef0123456789abcdef",
    );
  });

  it.each(["", "../x", "a/b", "a b", "a.b", "%2e", "a".repeat(129), "é"])("refuses %j", (id) => {
    expect(() => sessionSegment(id)).toThrow(IdentityError);
  });

  it("refuses with a validation error", () => {
    expect(() => sessionSegment("a/b")).toThrow(expect.objectContaining({ code: "validation" }));
  });
});
