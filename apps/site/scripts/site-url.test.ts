import { describe, expect, it } from "vitest";
import { PLACEHOLDER_SITE_URL, siteUrlFrom } from "./site-url";

describe("the site's public address", () => {
  it("is a placeholder on a reserved domain when IDG_SITE_URL is not set", () => {
    expect(siteUrlFrom({}).href).toBe(PLACEHOLDER_SITE_URL);
    expect(new URL(PLACEHOLDER_SITE_URL).hostname.endsWith(".example")).toBe(true);
  });

  it("is a placeholder when IDG_SITE_URL is empty", () => {
    expect(siteUrlFrom({ IDG_SITE_URL: "" }).href).toBe(PLACEHOLDER_SITE_URL);
  });

  it.each([
    ["https://identgineer.dev", "https://identgineer.dev/"],
    ["https://identgineer.dev/", "https://identgineer.dev/"],
    ["https://WWW.Identgineer.dev:8443", "https://www.identgineer.dev:8443/"],
    ["http://localhost:4174", "http://localhost:4174/"],
    ["https://bücher.dev", "https://xn--bcher-kva.dev/"],
    ["http://127.0.0.1:4174", "http://127.0.0.1:4174/"],
    ["http://[::1]:4174", "http://[::1]:4174/"],
  ])("takes %s as %s", (given, expected) => {
    expect(siteUrlFrom({ IDG_SITE_URL: given }).href).toBe(expected);
  });

  it.each([
    ["not a url", "is not an absolute URL"],
    ["ftp://identgineer.dev", "must use https or http"],
    ["https://user:secret@identgineer.dev", "must not hold a user name or password"],
    ["https://identgineer.dev/site/", "must be the root of its origin"],
    ["https://identgineer.dev/?a=1", "must be the root of its origin"],
    ["https://identgineer.dev/#top", "must be the root of its origin"],
    ['https://ident"gineer.dev', "must name its host with letters, digits, dots and hyphens"],
    ["https://it's.dev", "must name its host with letters, digits, dots and hyphens"],
    ["https://a{b}.dev", "must name its host with letters, digits, dots and hyphens"],
    ["https://a_b.dev", "must name its host with letters, digits, dots and hyphens"],
    ["https://-identgineer.dev", "must name its host with letters, digits, dots and hyphens"],
    ["https://identgineer..dev", "must name its host with letters, digits, dots and hyphens"],
  ])("refuses %s, which %s", (given, reason) => {
    expect(() => siteUrlFrom({ IDG_SITE_URL: given })).toThrow(reason);
  });

  // Every link of the site is root-relative, so the site can only be served at the root.
  it("names the setting in its error", () => {
    expect(() => siteUrlFrom({ IDG_SITE_URL: "nope" })).toThrow(/IDG_SITE_URL/);
  });
});
