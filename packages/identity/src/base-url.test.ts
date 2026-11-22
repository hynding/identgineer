import { describe, expect, it } from "vitest";
import { parseBaseUrl } from "./base-url.ts";

describe("parseBaseUrl", () => {
  it("accepts an https origin and drops a trailing slash", () => {
    expect(parseBaseUrl("https://cms.example.com/").href).toBe("https://cms.example.com/");
    expect(parseBaseUrl("https://cms.example.com").origin).toBe("https://cms.example.com");
  });

  it("keeps a path prefix, without its trailing slash", () => {
    expect(parseBaseUrl("https://example.com/cms/").pathname).toBe("/cms");
  });

  it.each(["http://localhost:1337", "http://127.0.0.1:8000", "http://[::1]:1337"])(
    "accepts %s for development",
    (value) => {
      expect(parseBaseUrl(value).protocol).toBe("http:");
    },
  );

  it.each([
    "http://cms.example.com",
    "http://localhost.example.com",
    "ftp://cms.example.com",
    "javascript:alert(1)",
    "data:text/plain,hi",
    "//cms.example.com",
    "/api",
    "",
    "https://user:pass@cms.example.com",
    "https://cms.example.com/?q=1",
    "https://cms.example.com/#x",
  ])("refuses %j", (value) => {
    expect(() => parseBaseUrl(value)).toThrow(TypeError);
  });
});
