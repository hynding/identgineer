import { describe, expect, it } from "vitest";
import { createCookieJar, isSameSite, isTrustworthy } from "./cookie-jar.ts";

const API = new URL("http://127.0.0.1:8000/api/auth/local");
const REFRESH = new URL("http://127.0.0.1:8000/api/auth/refresh");
const PAGE = new URL("http://127.0.0.1:5173");
const REFRESH_COOKIE =
  "strapi_up_refresh=abc.def; expires=Tue, 22 Dec 2026 16:14:54 GMT; Max-Age=600; path=/api/auth; secure; httponly; samesite=strict";

const jarAt = (start = 1_000_000) => {
  let time = start;
  const jar = createCookieJar({ now: () => time });
  return {
    jar,
    advance: (ms: number) => {
      time += ms;
    },
  };
};

describe("the live tests' cookie jar", () => {
  it("keeps the refresh cookie with the attributes it was set with", () => {
    const { jar } = jarAt();
    jar.store(API, REFRESH_COOKIE);
    expect(jar.get("strapi_up_refresh")).toMatchObject({
      value: "abc.def",
      domain: "127.0.0.1",
      hostOnly: true,
      path: "/api/auth",
      secure: true,
      httpOnly: true,
      sameSite: "strict",
      expiresAt: 1_000_000 + 600_000,
    });
  });

  it("sends it under its path only", () => {
    const { jar } = jarAt();
    jar.store(API, REFRESH_COOKIE);
    expect(jar.header(REFRESH, PAGE)).toBe("strapi_up_refresh=abc.def");
    expect(jar.header(new URL("http://127.0.0.1:8000/api/profiles"), PAGE)).toBeUndefined();
    expect(jar.header(new URL("http://127.0.0.1:8000/api/authx"), PAGE)).toBeUndefined();
  });

  it("does not send a Strict or Lax cookie on a fetch from another site", () => {
    const { jar } = jarAt();
    jar.store(API, REFRESH_COOKIE);
    jar.store(API, "lax=1; path=/");
    expect(jar.header(REFRESH, new URL("https://evil.example"))).toBeUndefined();
    expect(jar.header(REFRESH, new URL("http://127.0.0.1:6666"))).toBe(
      "strapi_up_refresh=abc.def; lax=1",
    );
  });

  it("sends a SameSite=None cookie across sites, and refuses one that is not Secure", () => {
    const { jar } = jarAt();
    jar.store(API, "open=1; path=/; secure; samesite=none");
    jar.store(API, "loose=1; path=/; samesite=none");
    expect(jar.header(REFRESH, new URL("https://evil.example"))).toBe("open=1");
  });

  it("drops a cookie at its Max-Age, and Max-Age wins over Expires", () => {
    const { jar, advance } = jarAt();
    jar.store(API, REFRESH_COOKIE);
    advance(599_999);
    expect(jar.header(REFRESH, PAGE)).toBeDefined();
    advance(1);
    expect(jar.header(REFRESH, PAGE)).toBeUndefined();
  });

  it("clears a cookie set again with a past expiry or Max-Age=0", () => {
    const { jar } = jarAt();
    jar.store(API, REFRESH_COOKIE);
    jar.store(
      API,
      "strapi_up_refresh=deleted; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/api/auth",
    );
    expect(jar.get("strapi_up_refresh")).toBeUndefined();
    jar.store(API, REFRESH_COOKIE);
    jar.store(API, "strapi_up_refresh=; Max-Age=0; path=/api/auth; secure");
    expect(jar.get("strapi_up_refresh")).toBeUndefined();
  });

  it("keeps a clearing cookie of another path from touching it", () => {
    const { jar } = jarAt();
    jar.store(API, REFRESH_COOKIE);
    jar.store(API, "strapi_up_refresh=; Max-Age=0; path=/");
    expect(jar.get("strapi_up_refresh")?.value).toBe("abc.def");
  });

  it("treats http on a loopback host as secure, as browsers do, and plain http elsewhere not", () => {
    expect(isTrustworthy(new URL("http://127.0.0.1:8000"))).toBe(true);
    expect(isTrustworthy(new URL("http://localhost:8000"))).toBe(true);
    expect(isTrustworthy(new URL("http://cms.example"))).toBe(false);
    const { jar } = jarAt();
    jar.store(new URL("http://cms.example/api/auth/local"), REFRESH_COOKIE);
    expect(jar.all()).toEqual([]);
  });

  it("does not send a Secure cookie over plain http to another host", () => {
    const { jar } = jarAt();
    jar.store(
      new URL("https://cms.example/api/auth/local"),
      "s=1; path=/; secure; domain=cms.example",
    );
    expect(
      jar.header(new URL("http://cms.example/api/auth/refresh"), new URL("http://cms.example")),
    ).toBeUndefined();
    expect(
      jar.header(new URL("https://cms.example/api/auth/refresh"), new URL("https://cms.example")),
    ).toBe("s=1");
  });

  it("refuses a Domain the setting host does not match, and keeps a host-only cookie to its host", () => {
    const { jar } = jarAt();
    jar.store(new URL("https://cms.example/x"), "a=1; domain=other.example; path=/");
    expect(jar.all()).toEqual([]);
    jar.store(new URL("https://cms.example/x"), "b=1; path=/");
    expect(
      jar.header(new URL("https://sub.cms.example/x"), new URL("https://cms.example")),
    ).toBeUndefined();
  });

  it("defaults the path to the request's directory", () => {
    const { jar } = jarAt();
    jar.store(API, "d=1");
    expect(jar.get("d")?.path).toBe("/api/auth");
  });

  it("knows which pages are same-site", () => {
    expect(isSameSite(new URL("http://127.0.0.1:1"), new URL("http://127.0.0.1:2"))).toBe(true);
    expect(isSameSite(new URL("https://a.example.com"), new URL("https://b.example.com"))).toBe(
      true,
    );
    expect(isSameSite(new URL("http://a.example.com"), new URL("https://a.example.com"))).toBe(
      false,
    );
    expect(isSameSite(new URL("http://127.0.0.1"), new URL("http://localhost"))).toBe(false);
  });
});
