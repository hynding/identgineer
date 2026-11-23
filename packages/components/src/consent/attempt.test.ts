import { describe, expect, it } from "vitest";
import { attempt } from "./attempt";

describe("attempt", () => {
  it("returns what the action returns", () => {
    expect(attempt(() => true)).toBe(true);
    expect(attempt(() => false)).toBe(false);
  });

  it("is false for an action that throws, whatever it throws", () => {
    expect(
      attempt(() => {
        throw new Error("storage is full");
      }),
    ).toBe(false);
    expect(
      attempt(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a page's object may throw anything
        throw "a string";
      }),
    ).toBe(false);
  });

  it("is false for an answer that is not a boolean, as a page's own consent object may give", () => {
    expect(attempt(() => undefined as never)).toBe(false);
    expect(attempt(() => "yes" as never)).toBe(false);
  });
});
