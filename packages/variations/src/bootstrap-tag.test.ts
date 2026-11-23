import { describe, expect, it } from "vitest";
import { buildBootstrapFiles } from "./bootstrap-files.ts";
import { bootstrapScriptAttributes } from "./bootstrap-tag.ts";

const INTEGRITY = JSON.parse(buildBootstrapFiles()["bootstrap.sri.json"] ?? "{}") as {
  integrity: string;
};

describe("bootstrapScriptAttributes", () => {
  it.each(["/bootstrap.js", "/variations/bootstrap.js", "/assets/v1.2/idg-bootstrap.js"])(
    "accepts the same-origin path %s",
    (src) => {
      expect(bootstrapScriptAttributes(src)).toEqual({ src, integrity: INTEGRITY.integrity });
    },
  );

  it.each([
    ["a full URL", "https://cdn.example.com/bootstrap.js", /same-origin path/],
    ["a protocol-relative URL", "//cdn.example.com/bootstrap.js", /"\/\/"/],
    ["a double slash further in", "/a//bootstrap.js", /"\/\/"/],
    ["a relative path", "bootstrap.js", /start with a single "\/"/],
    ["a relative path with dots", "./bootstrap.js", /start with a single "\/"/],
    ["the empty string", "", /start with a single "\/"/],
    ["a javascript URL", "javascript:alert(1)", /start with a single "\/"/],
    ["a data URL", "data:text/javascript,alert(1)", /start with a single "\/"/],
    ["a backslash", "/a\\bootstrap.js", /backslash/],
    ["a leading slash-backslash", "/\\evil.example/x.js", /backslash/],
    ["a newline", "/a\nbootstrap.js", /control character/],
    ["a tab", "/a\tbootstrap.js", /control character/],
    ["a NUL", "/a\0.js", /control character/],
    ["a DEL", "/a\x7f.js", /control character/],
  ])("rejects %s with a precise error", (_name, src, message) => {
    expect(() => bootstrapScriptAttributes(src)).toThrow(message);
  });

  it("names the offending value in the error", () => {
    expect(() => bootstrapScriptAttributes("https://evil.example/x.js")).toThrow(
      /"https:\/\/evil\.example\/x\.js"/,
    );
  });

  it("rejects a value that is not a string", () => {
    expect(() => bootstrapScriptAttributes(42 as never)).toThrow(/must be a string/);
  });
});
