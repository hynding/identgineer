import { describe, expect, it } from "vitest";
import { safeImageUrl } from "./safe-image-url";

describe("safeImageUrl", () => {
  it.each([
    "https://example.com/a.png",
    "http://example.com/a.png",
    "HTTPS://example.com/a.png",
    "/avatars/ada.png",
    "avatars/ada.png",
    "./ada.png",
    "../ada.png",
    "//cdn.example.com/ada.png",
    "ada.png?size=64#x",
  ])("keeps %s", (url) => {
    expect(safeImageUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "data:image/png;base64,AAAA",
    "blob:https://example.com/id",
    "file:///etc/passwd",
    "mailto:a@example.com",
    "tel:+15555550100",
    "ftp://example.com/a.png",
    " https://example.com/a.png",
    "java\tscript:alert(1)",
    "https:\\\\example.com",
    "",
    undefined,
    null,
  ])("refuses %j", (url) => {
    expect(safeImageUrl(url)).toBeUndefined();
  });
});
