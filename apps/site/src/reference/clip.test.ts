import { describe, expect, it } from "vitest";
import { clip, clipAtWord } from "./clip.ts";

describe("clipping text to a number of characters", () => {
  it("leaves text that fits, and cuts the rest to the limit with an ellipsis", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("abcdefghij", 6)).toBe("abcde…");
    expect(clip("abcdefghij", 6)).toHaveLength(6);
  });

  it("never leaves half of a surrogate pair", () => {
    expect(clip("ab😀cd", 4)).toBe("ab…");
  });
});

describe("clipping text at a word", () => {
  it("leaves text that fits whole, with nothing after it", () => {
    expect(clipAtWord("Fits as it is.", 40)).toEqual({ head: "Fits as it is.", rest: "" });
  });

  it("stops at the last sentence that fits, when that is more than half of the limit", () => {
    expect(clipAtWord("First sentence here. Second sentence is long.", 30)).toEqual({
      head: "First sentence here.",
      rest: "Second sentence is long.",
    });
  });

  it("stops at a comma, colon or semicolon of the last half when no sentence ends there", () => {
    expect(clipAtWord("A long sentence, that goes on and on without end", 30)).toEqual({
      head: "A long sentence…",
      rest: "that goes on and on without end",
    });
  });

  it("stops at a space, never inside a word, and drops the punctuation before the ellipsis", () => {
    expect(clipAtWord("alpha beta gamma delta", 14)).toEqual({
      head: "alpha beta…",
      rest: "gamma delta",
    });
    expect(clipAtWord("alpha beta, gamma delta", 13)).toEqual({
      head: "alpha beta…",
      rest: "gamma delta",
    });
  });

  it("keeps every word of the text, in order, between the head and the rest", () => {
    const text = "One two three four five six seven eight nine ten eleven twelve";
    for (let limit = 8; limit < text.length; limit += 1) {
      const { head, rest } = clipAtWord(text, limit);
      expect(head.length, `at ${String(limit)}`).toBeLessThanOrEqual(limit);
      expect(`${head.replace(/…$/, "")} ${rest}`.replace(/ +/g, " ").trim()).toBe(text);
    }
  });

  it("cuts inside a word only when the text is one word, as the cut can be nowhere else", () => {
    expect(clipAtWord("abcdefghijklmnop", 8)).toEqual({ head: "abcdefg…", rest: "hijklmnop" });
  });

  it("never leaves a code span half open: an odd number of backticks goes", () => {
    const { head, rest } = clipAtWord("Use `a b c` and more words here, please", 12);
    expect((head.match(/`/g) ?? []).length % 2).toBe(0);
    expect((rest.match(/`/g) ?? []).length % 2).toBe(0);
    expect(`${head.replace(/…$/, "")} ${rest}`).toBe("Use `a b c` and more words here, please");
  });
});
