import { describe, expect, it } from "vitest";
import { utf8Length } from "./utf8-length.ts";

describe("utf8Length", () => {
  it.each([
    ["", 0],
    ["a", 1],
    ["é", 2],
    ["€", 3],
    ["\u{1f600}", 4],
    ["aé€\u{1f600}", 10],
  ])("counts %j as %i bytes", (text, bytes) => {
    expect(utf8Length(text)).toBe(bytes);
  });

  it("counts a lone surrogate as the three bytes of its replacement", () => {
    expect(utf8Length("\ud800")).toBe(3);
    expect(utf8Length("\udc00x")).toBe(4);
  });

  it("agrees with TextEncoder on mixed text", () => {
    const text = "plain é 中文 \u{1f600} \u{10ffff} \u0000 \u007f \u0080 ߿ ࠀ";
    expect(utf8Length(text)).toBe(new TextEncoder().encode(text).length);
  });
});
