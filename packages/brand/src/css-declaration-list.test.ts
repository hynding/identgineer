import { describe, expect, it } from "vitest";
import { splitDeclarationList } from "./css-declaration-list.ts";

describe("a CSS declaration list, split as CSS Syntax splits it", () => {
  it("splits at each semicolon outside a comment, string or bracket, names lower-cased", () => {
    expect(
      splitDeclarationList(
        "/*a;b*/FILL : red ;; font-family:'x;y', \"z;w\"; -x:(a;[b;{c}]);x:url(a;b)",
      ),
    ).toEqual([
      { property: "fill", value: " red ", important: false },
      { property: "font-family", value: "'x;y', \"z;w\"", important: false },
      { property: "-x", value: "(a;[b;{c}])", important: false },
      { property: "x", value: "url(a;b)", important: false },
    ]);
  });

  it.each([
    ["red !important", "red ", true],
    ["red!IMPORTANT ", "red", true],
    ["red ! important", "red ", true],
    ["red !importantx", "red !importantx", false],
    ["'!important'", "'!important'", false],
    ["red !important/**/", "red !important/**/", false],
  ])("reads %j as %j, important %s", (value, rest, important) => {
    expect(splitDeclarationList(`fill:${value}`)).toEqual([
      { property: "fill", value: rest, important },
    ]);
  });

  it("reads an unquoted url to its closing parenthesis, a comment opener included", () => {
    expect(splitDeclarationList("x:url(a/*b);fill:red")).toEqual([
      { property: "x", value: "url(a/*b)", important: false },
      { property: "fill", value: "red", important: false },
    ]);
  });

  it.each(["-url", "#url", "1url", "aurl"])(
    "reads %s( as a bracket, not a url, as CSS does",
    (word) => {
      expect(
        splitDeclarationList(`x:${word}(a(b);c);fill:red`)?.map(({ property }) => property),
      ).toEqual(["x", "fill"]);
    },
  );

  it.each([
    "a/*",
    "a:'b",
    'a:"b',
    "a:'b\nc'",
    "a:(b",
    "a:b)",
    "a:(b]",
    "a:{b}",
    "{a:b}",
    "a:b}",
    "@a;b:c",
    "a:\\62",
    "a",
    "a b:c",
    "1a:b",
    "a(b):c",
    "a:url(b(c)",
    "a:url(b c)",
    "a:url(b'c)",
    "a:url(b",
    "é:b",
  ])("returns nothing for %j, where error recovery decides what follows", (style) => {
    expect(splitDeclarationList(style)).toBeUndefined();
  });

  it("takes a list of nothing but white space, comments and semicolons as empty", () => {
    expect(splitDeclarationList(" ; /* x */ ;")).toEqual([]);
  });
});
