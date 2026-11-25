import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  LOGO_CONTENT_SECURITY_POLICY,
} from "../browser/content-security-policy";

// The browser tests compare a response with these constants, so nothing but this test holds the
// policies' text: a loosening of either is a change to a line here, seen in review.
describe("the policies the browser tests are served under", () => {
  it("is exactly the strict policy", () => {
    expect(CONTENT_SECURITY_POLICY).toBe(
      "default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'",
    );
  });

  it("is the strict policy with img-src 'self' data: and nothing else added", () => {
    expect(LOGO_CONTENT_SECURITY_POLICY).toBe(
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'",
    );
  });
});
