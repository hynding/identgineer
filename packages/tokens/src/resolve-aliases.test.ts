import { describe, expect, it } from "vitest";
import { flattenTokens } from "./flatten-tokens.ts";
import { resolveAliases } from "./resolve-aliases.ts";

const FILE = "fixture.json";

function resolveToMap(json: unknown): Map<string, string> {
  const resolved = resolveAliases(flattenTokens(FILE, json));
  return new Map(resolved.map((token) => [token.path, JSON.stringify(token.value)]));
}

describe("flattenTokens", () => {
  it("flattens groups in source order and inherits $type", () => {
    const tokens = flattenTokens(FILE, {
      color: { $type: "color", a: { $value: "#000000" }, b: { $value: "#ffffff" } },
    });
    expect(tokens.map((token) => [token.path, token.type])).toEqual([
      ["color.a", "color"],
      ["color.b", "color"],
    ]);
  });

  it("rejects a value that does not fit its type, naming file and token", () => {
    expect(() => flattenTokens(FILE, { x: { $type: "color", $value: ["a"] } })).toThrow(
      'fixture.json: token "x" has a $value that is not valid for $type "color"',
    );
  });

  it("rejects names containing dots", () => {
    expect(() =>
      flattenTokens(FILE, { a: { "b.c": { $type: "color", $value: "#000000" } } }),
    ).toThrow('invalid group or token name "b.c"');
  });
});

describe("resolveAliases", () => {
  it("resolves chained aliases and inherits the target type", () => {
    const resolved = resolveAliases(
      flattenTokens(FILE, {
        base: { $type: "color", $value: "#112233" },
        mid: { $value: "{base}" },
        top: { $value: "{mid}" },
      }),
    );
    expect(resolved.map((token) => [token.path, token.type, token.value])).toEqual([
      ["base", "color", "#112233"],
      ["mid", "color", "#112233"],
      ["top", "color", "#112233"],
    ]);
  });

  it("interpolates aliases embedded in a string", () => {
    const values = resolveToMap({
      unit: { $type: "dimension", $value: "4px" },
      pad: { $type: "dimension", $value: "calc({unit} * 2)" },
    });
    expect(values.get("pad")).toBe('"calc(4px * 2)"');
  });

  it("resolves aliases inside gradient stops", () => {
    const values = resolveToMap({
      teal: { $type: "color", $value: "#14b8a6" },
      g: { $type: "gradient", $value: [{ color: "{teal}", position: 0 }] },
    });
    expect(values.get("g")).toBe('[{"color":"#14b8a6","position":0}]');
  });

  it("names the file, token and alias when an alias is missing", () => {
    expect(() =>
      resolveAliases(flattenTokens(FILE, { a: { $type: "color", $value: "{nope.here}" } })),
    ).toThrow('fixture.json: token "a" references unknown alias "{nope.here}"');
  });

  it("reports the full path of an alias cycle", () => {
    expect(() =>
      resolveAliases(
        flattenTokens(FILE, {
          a: { $type: "color", $value: "{b}" },
          b: { $type: "color", $value: "{c}" },
          c: { $type: "color", $value: "{a}" },
        }),
      ),
    ).toThrow("fixture.json: alias cycle a -> b -> c -> a");
  });

  it("rejects a self reference", () => {
    expect(() =>
      resolveAliases(flattenTokens(FILE, { a: { $type: "color", $value: "{a}" } })),
    ).toThrow("alias cycle a -> a");
  });

  it("requires a type when the value is not an alias", () => {
    expect(() => resolveAliases(flattenTokens(FILE, { a: { $value: "#000000" } }))).toThrow(
      'token "a" has no $type',
    );
  });
});
