import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as copy from "./controls-copies";
import { oneOf } from "./choice";
import { initials } from "./initials";
import { linkRel } from "./link-rel";
import { safeUrl } from "./safe-url";
import { validityFlags } from "./validity";

const URLS = [
  "https://example.com/path?q=1#top",
  "HTTPS://EXAMPLE.COM",
  "mailto:a@b.c",
  "tel:+1555",
  "/absolute",
  "relative/path",
  "?next=javascript:alert(1)",
  "#a:b",
  "//cdn.example.com/x",
  "javascript:alert(1)",
  " javascript:alert(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
  "data:text/html,x",
  "vbscript:x",
  "https:\\\\evil.example",
  "\u0000https://x",
  "\u007fhttps://x",
  "",
  undefined,
  null,
];

describe("the copies the controls bundle holds", () => {
  it("choose as the original does", () => {
    for (const value of ["a", "b", "c", undefined, null, 3, "A", ""]) {
      expect(copy.oneOf(["a", "b"] as const, value, "a")).toBe(
        oneOf(["a", "b"] as const, value, "a"),
      );
    }
  });

  it.each(["Ada Lovelace", "ada", "  ", "", "東京 ブランド", "😀 Zed", "a b c d", undefined, null])(
    "make the initials of %j as the original does",
    (name) => {
      expect(copy.initials(name)).toBe(initials(name));
    },
  );

  it.each(URLS)("refuse or keep the url %j as the original does", (url) => {
    expect(copy.safeUrl(url)).toBe(safeUrl(url));
  });

  it.each([
    [undefined, undefined],
    ["", "nofollow"],
    ["_self", "nofollow"],
    ["_SELF", undefined],
    ["_blank", undefined],
    ["_blank", "NOFOLLOW  external"],
    ["frame", "noopener"],
  ])("harden the rel of target %j and rel %j as the original does", (target, rel) => {
    expect(copy.linkRel(target, rel)).toBe(linkRel(target, rel));
  });

  it("copy the flags of a validity state as the original does", () => {
    const state = {
      badInput: true,
      customError: false,
      patternMismatch: true,
      rangeOverflow: false,
      rangeUnderflow: true,
      stepMismatch: false,
      tooLong: true,
      tooShort: false,
      typeMismatch: true,
      valueMissing: false,
      valid: false,
    };
    expect(copy.validityFlags(state)).toEqual(validityFlags(state));
  });
});

// The cases above sample the behaviour; this holds the code itself, so that a change to an original
// (a scheme added to the allowed ones) or to its copy alone is caught, not only one the samples hit.
const normalised = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/^\s*\/\/.*$/gm, "")
    .replaceAll(/\bexport\s+/g, "")
    .replaceAll(/\s+/g, "");

describe("the source of the copies", () => {
  const copies = normalised("./controls-copies.ts");

  it.each(["choice.ts", "initials.ts", "safe-url.ts", "link-rel.ts", "validity.ts"])(
    "holds all the code of %s, comments and spacing aside",
    (original) => {
      expect(copies).toContain(normalised(`./${original}`));
    },
  );

  it("holds nothing that is not one of the originals", () => {
    const originals = ["choice", "initials", "safe-url", "link-rel", "validity"]
      .map((name) => normalised(`./${name}.ts`))
      .join("");
    expect(copies.length).toBe(originals.length);
  });
});
