import { describe, expect, it } from "vitest";
import { MARK, displayText, neutraliseText, truncateText } from "./untrusted-text";

describe("neutraliseText", () => {
  it("leaves ordinary text as it is, in any script, with emoji and joined emoji", () => {
    for (const text of [
      "signup_completed",
      "Ünïcödé",
      "日本語",
      "שלום עולם",
      "مرحبا",
      "👩‍👩‍👧 ok",
      "a b",
    ]) {
      expect(neutraliseText(text)).toBe(text);
    }
  });

  it("turns line breaks, tabs and other white space controls into one space each", () => {
    expect(neutraliseText("a\nb\r\nc\td\u0085e f g\vh\fi")).toBe("a b  c d e f g h i");
  });

  it("replaces the bidirectional controls, which could reorder text around them", () => {
    for (const code of [
      0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f,
      0x061c,
    ]) {
      const text = `pay${String.fromCodePoint(code)}fdp.exe`;
      expect(neutraliseText(text)).toBe(`pay${MARK}fdp.exe`);
    }
  });

  it("replaces the other control characters and the invisible format characters", () => {
    for (const code of [
      0x0000, 0x0007, 0x001b, 0x007f, 0x0090, 0x009f, 0x200b, 0x2060, 0xfeff, 0x00ad, 0xe0041,
    ]) {
      expect(neutraliseText(`a${String.fromCodePoint(code)}b`)).toBe(`a${MARK}b`);
    }
  });

  it("replaces lone surrogates, which are not text", () => {
    expect(neutraliseText("a\ud800b")).toBe(`a${MARK}b`);
    expect(neutraliseText("a\udc00b")).toBe(`a${MARK}b`);
  });

  it("keeps the zero width joiner only between two characters that are not white space, as emoji need it", () => {
    expect(neutraliseText("👨‍💻")).toBe("👨‍💻");
    expect(neutraliseText("‍x")).toBe(`${MARK}x`);
    expect(neutraliseText("x‍")).toBe(`x${MARK}`);
    expect(neutraliseText("x‍‍y")).toBe(`x${MARK}${MARK}y`);
  });

  it("makes a run of replaced characters show as a run, so how many there were is not hidden", () => {
    expect(neutraliseText("a‮‮‮b")).toBe(`a${MARK}${MARK}${MARK}b`);
  });

  it("is idempotent", () => {
    const once = neutraliseText("a‮b\nc‍");
    expect(neutraliseText(once)).toBe(once);
  });

  it("never throws for text that is not text", () => {
    expect(neutraliseText(undefined as unknown as string)).toBe("");
    expect(neutraliseText(null as unknown as string)).toBe("");
    expect(neutraliseText(12 as unknown as string)).toBe("12");
  });
});

describe("truncateText", () => {
  it("leaves text at or under the limit alone", () => {
    expect(truncateText("abc", 3)).toBe("abc");
  });

  it("cuts at the limit and marks the cut with an ellipsis that counts toward it", () => {
    expect(truncateText("abcdef", 4)).toBe("abc…");
  });

  it("counts characters and not code units, so it never cuts an emoji in half", () => {
    expect(truncateText("😀😀😀😀", 3)).toBe("😀😀…");
    expect(truncateText("😀😀😀", 3)).toBe("😀😀😀");
  });

  it("does not leave a joiner dangling before the ellipsis", () => {
    expect(truncateText("👨‍💻xxxx", 3)).toBe("👨…");
  });

  it("stays quick and bounded for text that is a million characters long", () => {
    const start = performance.now();
    const cut = truncateText("x".repeat(1_000_000), 10);
    expect(cut).toBe("xxxxxxxxx…");
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("displayText", () => {
  it("cuts first and neutralises what is left, so a huge string costs only its limit", () => {
    expect(displayText(`ab\u202e${"x".repeat(1_000_000)}`, 4)).toBe(`ab${MARK}…`);
  });

  it("shows a value that is not text as nothing, and a number as its digits", () => {
    expect(displayText({ toString: () => "<b>" }, 10)).toBe("");
    expect(displayText(42, 10)).toBe("42");
  });
});
