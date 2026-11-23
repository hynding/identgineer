import { describe, expect, it } from "vitest";
import { sanitiseProperties } from "./sanitise-properties.ts";
import type { FieldType } from "./event-declarations.ts";

const DECLARED = new Map<string, FieldType>([
  ["plan", "string"],
  ["seats", "number"],
  ["trial", "boolean"],
  ["constructor", "string"],
]);

const run = (input: unknown, maxStringLength = 256) =>
  sanitiseProperties(DECLARED, input, maxStringLength);

describe("sanitiseProperties", () => {
  it("keeps declared properties of the declared type", () => {
    const { properties, drops } = run({ plan: "pro", seats: 3, trial: false });
    expect(properties).toEqual({ plan: "pro", seats: 3, trial: false });
    expect(drops).toEqual([]);
  });

  it("accepts no properties at all", () => {
    expect(run(undefined)).toEqual({ properties: {}, drops: [] });
    expect(run({})).toEqual({ properties: {}, drops: [] });
  });

  it("drops an undeclared property, names its key and never carries its value", () => {
    const { properties, drops } = run({ plan: "pro", email: "ada@example.com" });
    expect(properties).toEqual({ plan: "pro" });
    expect(drops).toHaveLength(1);
    expect(drops[0]?.code).toBe("undeclared-property");
    expect(drops[0]?.message).toContain("email");
    expect(drops[0]?.message).not.toContain("ada@example.com");
  });

  it("drops a property of the wrong type and names the declared type", () => {
    const { properties, drops } = run({ plan: 5, seats: "3", trial: "yes" });
    expect(properties).toEqual({});
    expect(drops.map((drop) => drop.code)).toEqual([
      "invalid-property",
      "invalid-property",
      "invalid-property",
    ]);
    expect(drops[0]?.message).toContain("plan");
    expect(drops[0]?.message).toContain("string");
  });

  it.each([NaN, Infinity, -Infinity])("drops the number %s", (value) => {
    const { properties, drops } = run({ seats: value });
    expect(properties).toEqual({});
    expect(drops[0]?.code).toBe("invalid-property");
  });

  it.each([
    ["an object", { a: 1 }],
    ["an array", [1]],
    ["null", null],
    ["undefined", undefined],
    ["a function", () => 1],
    ["a symbol", Symbol("x")],
    ["a bigint", 1n],
  ])("drops %s where a string is declared", (_label, value) => {
    expect(run({ plan: value }).properties).toEqual({});
  });

  it("keeps negative and fractional numbers and zero", () => {
    expect(run({ seats: -0.5 }).properties).toEqual({ seats: -0.5 });
    expect(run({ seats: 0 }).properties).toEqual({ seats: 0 });
  });

  it.each([["null", null], ["an array", ["plan"]], ["a string", "plan"], ["a number", 1]])(
    "drops properties given as %s",
    (_label, input) => {
      const { properties, drops } = run(input);
      expect(properties).toEqual({});
      expect(drops.map((drop) => drop.code)).toEqual(["invalid-properties"]);
    },
  );

  it("refuses __proto__ as an undeclared key and pollutes nothing", () => {
    const input = JSON.parse('{"__proto__":{"polluted":true},"plan":"pro"}') as unknown;
    const { properties, drops } = run(input);
    expect(properties).toEqual({ plan: "pro" });
    expect(Object.getPrototypeOf(properties)).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(drops[0]?.code).toBe("undeclared-property");
  });

  it("treats a declared constructor property as an ordinary key", () => {
    const { properties } = run({ constructor: "x" });
    expect(Object.hasOwn(properties, "constructor")).toBe(true);
    expect(properties["constructor"]).toBe("x");
  });

  it("ignores inherited properties", () => {
    const input = Object.create({ plan: "inherited" }) as Record<string, unknown>;
    expect(run(input).properties).toEqual({});
  });

  it("survives a property whose getter throws", () => {
    const input = {
      get plan(): string {
        throw new Error("hostile");
      },
      seats: 2,
    };
    const { properties, drops } = run(input);
    expect(properties).toEqual({ seats: 2 });
    expect(drops[0]?.code).toBe("invalid-property");
  });

  describe("strings", () => {
    it("cuts a huge string to the limit", () => {
      const { properties } = run({ plan: "x".repeat(1_000_000) }, 256);
      expect(properties["plan"]).toBe("x".repeat(256));
    });

    it("cuts on a code point boundary, never inside a surrogate pair", () => {
      const { properties } = run({ plan: `${"x".repeat(255)}\u{1f600}tail` }, 256);
      expect(properties["plan"]).toBe("x".repeat(255));
    });

    it("keeps a pair that fits exactly", () => {
      const { properties } = run({ plan: `${"x".repeat(254)}\u{1f600}tail` }, 256);
      expect(properties["plan"]).toBe(`${"x".repeat(254)}\u{1f600}`);
    });

    it.each([
      ["a lone high surrogate", "a\ud800b", "a�b"],
      ["a lone low surrogate", "a\udc00b", "a�b"],
      ["a reversed pair", "\udc00\ud800", "��"],
      ["a trailing high surrogate", "ab\ud83d", "ab�"],
    ])("replaces %s", (_label, input, expected) => {
      expect(run({ plan: input }).properties["plan"]).toBe(expected);
    });

    it("leaves the empty string and a string at exactly the limit alone", () => {
      expect(run({ plan: "" }).properties["plan"]).toBe("");
      expect(run({ plan: "y".repeat(256) }).properties["plan"]).toBe("y".repeat(256));
    });
  });
});
