import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_BYTES, utf8ByteLength } from "./password-bytes";

describe("utf8ByteLength", () => {
  it("counts the bytes bcrypt reads, not the characters", () => {
    expect(utf8ByteLength("")).toBe(0);
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("€")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
  });

  it("puts the limit at the 72 bytes bcrypt reads", () => {
    expect(MAX_PASSWORD_BYTES).toBe(72);
    expect(utf8ByteLength("é".repeat(36))).toBe(MAX_PASSWORD_BYTES);
  });
});
