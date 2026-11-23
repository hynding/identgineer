import { describe, expect, it } from "vitest";
import { minimisePath, minimiseReferrer } from "./minimise-url.ts";

const PAGE = "https://shop.example.com/cart?step=2#pay";

const path = (input: string, allowed: readonly string[] = [], base: string | null = PAGE) =>
  minimisePath(input, base ?? undefined, {
    allowedQueryParameters: new Set(allowed),
    maxValueLength: 32,
  });

describe("minimisePath", () => {
  it.each([
    ["an absolute URL", "https://shop.example.com/a/b", "/a/b"],
    ["the query and fragment of an absolute URL", "https://shop.example.com/a?q=1&r=2#x", "/a"],
    ["a URL of another origin", "https://other.example.org/a/b?x=1", "/a/b"],
    ["credentials in the URL", "https://ada:hunter2@shop.example.com/a", "/a"],
    ["a port", "http://localhost:3000/a?b=c", "/a"],
    ["a bare origin", "https://shop.example.com", "/"],
    ["a path-relative reference", "details/1?x=1", "/details/1"],
    ["a root-relative reference", "/details/1?x=1#y", "/details/1"],
    ["a protocol-relative reference", "//evil.example.net/steal?x=1", "/steal"],
    ["a fragment-only reference", "#top", "/cart"],
    ["dot segments", "/a/../b/./c", "/b/c"],
    ["an IDN host", "https://münchen.example/straße?x=1", "/stra%C3%9Fe"],
    ["a path with non-ASCII letters", "/café", "/caf%C3%A9"],
    ["a path with spaces", "/a b", "/a%20b"],
    ["tabs and newlines the parser drops", "/a\t/b\n", "/a/b"],
    ["matrix parameters on a segment", "/a;jsessionid=XYZ/b;x=1;y=2", "/a/b"],
    ["a segment that is only matrix parameters", "/a/;jsessionid=XYZ/b", "/a//b"],
    ["a segment with an encoded question mark", "/reset/token%3Fabc/x", "/reset/-/x"],
    ["a segment with an encoded question mark in lower case", "/p/a%3fb", "/p/-"],
    ["a segment with an encoded hash", "/p/a%23b/c", "/p/-/c"],
    ["a segment with an encoded hash in lower case", "/p/a%23", "/p/-"],
    ["a segment with an at sign", "/u/ada@example.com/profile", "/u/-/profile"],
    ["a segment with an encoded at sign", "/u/ada%40example.com", "/u/-"],
    ["a segment with an encoded at sign in lower case", "/u/ada%40", "/u/-"],
    ["an at sign after matrix parameters is cut with them", "/u/ada;x=a@b", "/u/ada"],
    ["an at sign before matrix parameters", "/u/a@b;x=1", "/u/-"],
    ["only the segment with the identifier", "/team/42/ada@x.io/settings", "/team/42/-/settings"],
  ])("reduces %s to a path", (_label, input, expected) => {
    expect(path(input)).toBe(expected);
  });

  it.each([
    ["a javascript: URL", "javascript:alert(document.cookie)"],
    ["a data: URL", "data:text/html,<script>alert(1)</script>"],
    ["a blob: URL", "blob:https://shop.example.com/uuid"],
    ["a file: URL", "file:///etc/passwd"],
    ["an ftp: URL", "ftp://example.com/a"],
    ["a mailto: URL", "mailto:ada@example.com"],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["an unparsable URL", "http://"],
  ])("refuses %s", (_label, input) => {
    expect(path(input)).toBeUndefined();
  });

  it("refuses a relative reference when there is no page to resolve it against", () => {
    expect(path("/a", [], null)).toBeUndefined();
    expect(path("https://example.com/a", [], null)).toBe("/a");
  });

  it("refuses a page that is not http or https", () => {
    expect(path("/a", [], "file:///home/ada/index.html")).toBeUndefined();
    expect(path("/a", [], "about:blank")).toBeUndefined();
  });

  describe("allowed query parameters", () => {
    it("keeps only the named parameters, in their order", () => {
      expect(path("/p?b=2&secret=x&a=1&token=t", ["a", "b"])).toBe("/p?b=2&a=1");
    });

    it("keeps a repeated parameter each time", () => {
      expect(path("/p?a=1&a=2", ["a"])).toBe("/p?a=1&a=2");
    });

    it("matches names exactly, case included", () => {
      expect(path("/p?UTM_SOURCE=x&utm_source=y", ["utm_source"])).toBe("/p?utm_source=y");
    });

    it("leaves no question mark when nothing is allowed", () => {
      expect(path("/p?secret=x", ["utm_source"])).toBe("/p");
      expect(path("/p?", ["utm_source"])).toBe("/p");
    });

    it("keeps an empty value and a bare name", () => {
      expect(path("/p?a=&b", ["a", "b"])).toBe("/p?a=&b=");
    });

    it("never keeps the fragment, even one that looks like a parameter", () => {
      expect(path("/p?a=1#b=2", ["a", "b"])).toBe("/p?a=1");
    });

    it("re-encodes values and cuts them to the value limit", () => {
      expect(path("/p?a=x%20y%26z", ["a"])).toBe("/p?a=x+y%26z");
      expect(path(`/p?a=${"v".repeat(100)}`, ["a"])).toBe(`/p?a=${"v".repeat(32)}`);
    });

    it("cuts a value on a code point boundary", () => {
      const value = `${"v".repeat(31)}\u{1f600}`;
      expect(path(`/p?a=${encodeURIComponent(value)}`, ["a"])).toBe(`/p?a=${"v".repeat(31)}`);
    });

    it("ignores an allowed name that only exists in the fragment or the path", () => {
      expect(path("/a=1?x=1#a=2", ["a"])).toBe("/a=1");
    });

    it("never lets a prototype name through as an allowed parameter", () => {
      expect(path("/p?__proto__=x&constructor=y", [])).toBe("/p");
    });
  });

  it("cuts a path over 512 characters without leaving half an escape", () => {
    const cut = path(`/${"a".repeat(510)}%C3%A9`);
    expect(cut).toBe(`/${"a".repeat(510)}`);
    expect(path(`/${"a".repeat(600)}`)).toHaveLength(512);
  });
});

describe("minimiseReferrer", () => {
  const referrer = (input: string, page: string | undefined = PAGE) =>
    minimiseReferrer(input, page);

  it.each([
    ["a search page", "https://www.google.com/search?q=my+illness#x", "https://www.google.com"],
    ["credentials", "https://ada:hunter2@news.example.org/a", "https://news.example.org"],
    ["a port", "http://localhost:3000/x?y=1", "http://localhost:3000"],
    ["an IDN host", "https://münchen.example/a", "https://xn--mnchen-3ya.example"],
    ["a default port", "https://news.example.org:443/a", "https://news.example.org"],
    ["an IPv6 host", "http://[::1]:8080/a", "http://[::1]:8080"],
    ["upper-case letters", "HTTPS://News.Example.ORG/A", "https://news.example.org"],
  ])("reduces %s to an origin", (_label, input, expected) => {
    expect(referrer(input)).toBe(expected);
  });

  it.each([
    ["same-origin", "https://shop.example.com/other?x=1"],
    ["same-origin with a default port", "https://shop.example.com:443/other"],
    ["empty", ""],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/plain,hi"],
    ["an app URL", "android-app://com.google.android.gm"],
    ["about:blank", "about:blank"],
    ["an opaque origin", "file:///a"],
    ["garbage", "not a url"],
  ])("drops a referrer that is %s", (_label, input) => {
    expect(referrer(input)).toBeUndefined();
  });

  it("keeps a different scheme or port of the page's own host", () => {
    expect(referrer("http://shop.example.com/a")).toBe("http://shop.example.com");
    expect(referrer("https://shop.example.com:8443/a")).toBe("https://shop.example.com:8443");
  });

  it("keeps the origin when the page is unknown", () => {
    expect(referrer("https://news.example.org/a", undefined)).toBe("https://news.example.org");
  });
});
