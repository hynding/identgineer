import { describe, expect, it } from "vitest";
import { MAX_BODY_CHARACTERS, parseJson } from "./parse-json.ts";

describe("parseJson", () => {
  it("parses a JSON document", () => {
    expect(parseJson('{"data":{"id":1,"tags":["a"]}}')).toEqual({ data: { id: 1, tags: ["a"] } });
  });

  it("treats an empty body as no value", () => {
    expect(parseJson("")).toBeUndefined();
  });

  it("refuses malformed JSON", () => {
    expect(() => parseJson("{nope")).toThrow(expect.objectContaining({ code: "unknown" }));
  });

  it.each(["__proto__", "constructor", "prototype"])("refuses a %s key at any depth", (key) => {
    expect(() => parseJson(`{"user":{"${key}":{"isAdmin":true}}}`)).toThrow(
      expect.objectContaining({ code: "unknown" }),
    );
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it("refuses a body larger than the limit", () => {
    const big = `"${"a".repeat(MAX_BODY_CHARACTERS)}"`;
    expect(() => parseJson(big)).toThrow(expect.objectContaining({ code: "unknown" }));
  });

  it("accepts a body just under the limit", () => {
    const fits = `"${"a".repeat(MAX_BODY_CHARACTERS - 2)}"`;
    expect(parseJson(fits)).toHaveLength(MAX_BODY_CHARACTERS - 2);
  });
});
