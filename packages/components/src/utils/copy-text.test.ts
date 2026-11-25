import { describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

describe("copyText", () => {
  it("writes exactly the text to the clipboard and says it did", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const text = 'a { color: #fff; }\n \ttabs and <b>markup</b> and "quotes"';
    expect(await copyText(text, { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(text);
  });

  it("says it did not when the clipboard rejects", async () => {
    const writeText = vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    expect(await copyText("x", { writeText })).toBe(false);
  });

  it("says it did not when the clipboard throws at once", async () => {
    const writeText = vi.fn(() => {
      throw new Error("no");
    });
    expect(await copyText("x", { writeText })).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["without writeText", {}],
    ["with a writeText that is not a function", { writeText: "yes" }],
    [
      "a getter that throws",
      new Proxy(
        {},
        {
          get: () => {
            throw new Error("no");
          },
        },
      ),
    ],
  ])("says it did not when the clipboard is %s", async (_name, clipboard) => {
    expect(await copyText("x", clipboard)).toBe(false);
  });

  it("reads the page's clipboard when none is given, and says it did not where there is none", async () => {
    expect(await copyText("x")).toBe(false);
  });
});
