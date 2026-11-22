import { describe, expect, it } from "vitest";
import { isVariationId, parseVariations, validateVariations } from "./validate.ts";

describe("isVariationId", () => {
  it("accepts a registry id on its own axis", () => {
    expect(isVariationId("theme", "ember")).toBe(true);
    expect(isVariationId("design", "glass")).toBe(true);
    expect(isVariationId("layout", "bento")).toBe(true);
    expect(isVariationId("ux", "focus")).toBe(true);
    expect(isVariationId("scheme", "dark")).toBe(true);
    expect(isVariationId("scheme", "system")).toBe(true);
  });

  it("rejects an id that belongs to another axis", () => {
    expect(isVariationId("theme", "glass")).toBe(false);
    expect(isVariationId("scheme", "ember")).toBe(false);
  });

  it.each([
    ["wrong case", "Ember"],
    ["leading whitespace", " ember"],
    ["trailing whitespace", "ember "],
    ["a newline", "ember\n"],
    ["the empty string", ""],
    ["a prototype key", "__proto__"],
    ["another prototype key", "constructor"],
    ["a prototype method", "toString"],
    ["an overly long string", "e".repeat(100_000)],
    ["a string that starts with an id", "ember-extra"],
  ])("rejects %s", (_name, value) => {
    expect(isVariationId("theme", value)).toBe(false);
  });

  it.each([[42], [null], [undefined], [true], [{}], [["ember"]], [Symbol("ember")]])(
    "rejects the non-string %s",
    (value) => {
      expect(isVariationId("theme", value)).toBe(false);
    },
  );

  it("rejects a String object, which is not the string primitive", () => {
    // eslint-disable-next-line no-new-wrappers, @typescript-eslint/no-wrapper-object-types
    expect(isVariationId("theme", new String("ember"))).toBe(false);
  });
});

describe("validateVariations", () => {
  it("keeps valid axes and reports each invalid one without coercing it", () => {
    const { valid, rejected } = validateVariations({
      theme: "ember",
      design: "GLASS",
      layout: 3,
      ux: "focus",
      scheme: "sepia",
    });
    expect(valid).toEqual({ theme: "ember", ux: "focus" });
    expect(rejected).toEqual([
      { axis: "design", value: "GLASS" },
      { axis: "layout", value: 3 },
      { axis: "scheme", value: "sepia" },
    ]);
  });

  it("treats an undefined axis as absent, not as a rejection", () => {
    expect(validateVariations({ theme: undefined })).toEqual({ valid: {}, rejected: [] });
  });

  it("ignores unknown keys and never reads inherited ones", () => {
    const input = Object.create({ theme: "ember" }) as Record<string, unknown>;
    input["extra"] = "x";
    expect(validateVariations(input)).toEqual({ valid: {}, rejected: [] });
  });

  it("does not let a __proto__ key through", () => {
    const input: unknown = JSON.parse('{"__proto__": {"theme": "ember"}, "theme": "tidal"}');
    const { valid } = validateVariations(input);
    expect(valid).toEqual({ theme: "tidal" });
    expect(Object.getPrototypeOf(valid)).toBe(Object.prototype);
  });

  it.each([[null], [undefined], ["theme=ember"], [42], [["ember"]], [() => "x"]])(
    "returns nothing for the non-record input %s",
    (input) => {
      expect(validateVariations(input)).toEqual({ valid: {}, rejected: [] });
    },
  );

  it("returns axes in a stable order whatever the input order", () => {
    const { valid } = validateVariations({ scheme: "dark", ux: "focus", theme: "ember" });
    expect(Object.keys(valid)).toEqual(["theme", "ux", "scheme"]);
  });

  it("does not throw on a getter that throws", () => {
    const input = {
      get theme(): string {
        throw new Error("boom");
      },
    };
    expect(validateVariations(input)).toEqual({
      valid: {},
      rejected: [{ axis: "theme", value: undefined }],
    });
  });
});

describe("parseVariations", () => {
  it("returns only the valid part", () => {
    expect(parseVariations({ theme: "paper", design: "nope" })).toEqual({ theme: "paper" });
  });
});
