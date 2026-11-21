import { describe, expect, it } from "vitest";
import { safeUrl } from "./safe-url";

describe("safeUrl", () => {
  describe("accepted", () => {
    it.each([
      "https://example.com/path?q=1#top",
      "http://example.com",
      "mailto:someone@example.com",
      "tel:+15551234567",
      "/absolute/path",
      "relative/path",
      "./sibling",
      "../parent",
      "?query=only",
      "#fragment",
      "page.html#section",
      "//cdn.example.com/asset",
    ])("keeps %s", (url) => {
      expect(safeUrl(url)).toBe(url);
    });

    it.each(["HTTPS://EXAMPLE.COM", "MailTo:a@b.c", "TEL:123"])("accepts mixed case %s", (url) => {
      expect(safeUrl(url)).toBe(url);
    });

    it("keeps a colon that comes after a path or query delimiter", () => {
      expect(safeUrl("a/b:c")).toBe("a/b:c");
      expect(safeUrl("?next=javascript:alert(1)")).toBe("?next=javascript:alert(1)");
      expect(safeUrl("#a:b")).toBe("#a:b");
    });

    // Without a colon before any path, query or fragment delimiter there is no scheme, so
    // these resolve against the current document and cannot execute anything.
    it.each([
      "jav&#x61;script:alert(1)",
      "&#106;avascript:alert(1)",
      "javascript&colon;alert(1)",
      "javascript%3Aalert(1)",
    ])("keeps %s, which is inert as a relative url", (url) => {
      expect(safeUrl(url)).toBe(url);
    });
  });

  describe("refused schemes", () => {
    it.each([
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "DATA:text/html;base64,AAAA",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/uuid",
      "ftp://example.com",
      "ws://example.com",
      "about:blank",
      "chrome://settings",
      "custom-scheme:payload",
      "%6Aavascript:alert(1)",
    ])("refuses %s", (url) => {
      expect(safeUrl(url)).toBeUndefined();
    });
  });

  describe("refused tricks", () => {
    it.each([
      [" javascript:alert(1)", "leading space"],
      ["\tjavascript:alert(1)", "leading tab"],
      ["\njavascript:alert(1)", "leading newline"],
      ["\u0000javascript:alert(1)", "leading NUL"],
      ["\u0001javascript:alert(1)", "leading control character"],
      [" javascript:alert(1)", "leading no-break space"],
      [" javascript:alert(1)", "leading line separator"],
      ["﻿javascript:alert(1)", "leading byte order mark"],
      ["java\tscript:alert(1)", "tab inside the scheme"],
      ["java\nscript:alert(1)", "newline inside the scheme"],
      ["java\rscript:alert(1)", "carriage return inside the scheme"],
      ["java\u0000script:alert(1)", "NUL inside the scheme"],
      ["javascript\u0000:alert(1)", "NUL before the colon"],
      ["https://example.com/\u0000", "control character at the end"],
      ["https://example.com ", "trailing space"],
      ["java script:alert(1)", "space inside the scheme"],
      ["https://exa\tmple.com", "tab inside an https url"],
      ["https://example.com/a\nb", "newline inside an https url"],
      ["\\\\evil.example.com", "backslashes that browsers read as slashes"],
      ["/\\evil.example.com", "slash then backslash"],
      ["https:\\\\evil.example.com", "https with backslashes"],
    ])("refuses %j (%s)", (url) => {
      expect(safeUrl(url)).toBeUndefined();
    });
  });

  describe("empty and non-string input", () => {
    it.each([undefined, null, "", "   "])("returns undefined for %j", (value) => {
      expect(safeUrl(value)).toBeUndefined();
    });
  });
});
