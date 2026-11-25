import { describe, expect, it } from "vitest";
import {
  artefactFile,
  FALLBACK_SLUG,
  fileSlug,
  FILE_SLUG_MAX_LENGTH,
  themeIdOf,
  usageSnippet,
} from "./brand-export-files";

const SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("fileSlug", () => {
  it.each([
    ["Harbour Lights", "harbour-lights"],
    ["ACME", "acme"],
    ["Acme Rockets, Inc.", "acme-rockets-inc"],
    ["  spaced   out  ", "spaced-out"],
    ["Café Münch", "cafe-munch"],
    ["Crème brûlée", "creme-brulee"],
    // A letter with no ASCII form leaves a hyphen where it was: this is the documented result.
    ["Ünïcødé Brånd", "unic-de-brand"],
    ["a--b__c", "a-b-c"],
    ["Brand 2", "brand-2"],
    ["x", "x"],
  ])("makes %j into %j", (name, slug) => {
    expect(fileSlug(name)).toBe(slug);
  });

  it.each([
    ["a path", "../../etc/passwd"],
    ["a windows path", "..\\..\\Windows\\System32"],
    ["a dot sequence", "a...b"],
    ["a leading dot", ".htaccess"],
    ["a null byte", "a\u0000b"],
    ["a slash", "a/b"],
    ["a backslash", "a\\b"],
    ["a colon", "C:evil"],
    ["a reserved device name", "con"],
    ["a reserved device name with a number", "LPT1"],
    ["an extension", "evil.exe"],
    ["markup", '<img src=x onerror="alert(1)">'],
    ["a bidirectional control", "pay‮fdp.exe"],
    ["a newline", "a\nb"],
    ["emoji", "party 🎉 time"],
    ["a percent escape", "%2e%2e%2f"],
  ])("gives only letters, digits and single hyphens for %s", (_name, name) => {
    const slug = fileSlug(name);
    expect(slug).toMatch(SAFE);
    expect(slug).not.toContain("..");
    expect(slug.length).toBeLessThanOrEqual(FILE_SLUG_MAX_LENGTH);
  });

  it("reads no more of a name than a file name can use, however long it is", () => {
    const started = performance.now();
    expect(fileSlug(`harbour${" ".repeat(5_000_000)}lights`)).toBe("harbour");
    expect(fileSlug("é".repeat(5_000_000))).toBe("e".repeat(FILE_SLUG_MAX_LENGTH));
    expect(performance.now() - started).toBeLessThan(200);
  });

  it.each([
    ["nothing but symbols", "!!!"],
    ["only white space", "   "],
    ["an empty string", ""],
    ["a script with no ASCII letters", "東京 ブランド"],
    ["only dots", "..."],
  ])("falls back for %s", (_name, name) => {
    expect(fileSlug(name)).toBe(FALLBACK_SLUG);
  });

  it.each([undefined, null, 4, {}, [], true, Symbol("x")])(
    "falls back for %s that is not text",
    (name) => {
      expect(fileSlug(name)).toBe(FALLBACK_SLUG);
    },
  );

  it.each(["con", "PRN", "Aux", "nul", "com1", "LPT9"])(
    "does not give %j, which a Windows file system reserves for a device",
    (name) => {
      expect(fileSlug(name)).toBe(FALLBACK_SLUG);
    },
  );

  it("cuts a long name, and leaves no hyphen at either end", () => {
    const long = fileSlug("word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(FILE_SLUG_MAX_LENGTH);
    expect(long).toMatch(SAFE);
    expect(fileSlug(`${"a".repeat(FILE_SLUG_MAX_LENGTH - 1)} b`)).toBe(
      "a".repeat(FILE_SLUG_MAX_LENGTH - 1),
    );
    expect(fileSlug("a".repeat(500))).toBe("a".repeat(FILE_SLUG_MAX_LENGTH));
  });

  it("is a fixed point: a slug is its own slug", () => {
    for (const name of ["Harbour Lights", "Café", "a".repeat(100), "../x"]) {
      expect(fileSlug(fileSlug(name))).toBe(fileSlug(name));
    }
  });
});

describe("artefactFile", () => {
  it("names the stylesheet and the token source, with an explicit type each", () => {
    expect(artefactFile("css", "harbour-lights")).toEqual({
      name: "harbour-lights.css",
      type: "text/css",
    });
    expect(artefactFile("tokens", "harbour-lights")).toEqual({
      name: "harbour-lights.json",
      type: "application/json",
    });
  });
});

describe("themeIdOf", () => {
  it.each(["aurora", "acme", "harbour-lights", "a1", "ab", "x".repeat(32), "a-b-c-1"])(
    "accepts %j, which the brand package's id rule allows",
    (id) => {
      expect(themeIdOf(id)).toBe(id);
    },
  );

  it.each([
    ["too short", "a"],
    ["too long", "x".repeat(33)],
    ["upper case", "Acme"],
    ["a leading digit", "1acme"],
    ["a leading hyphen", "-acme"],
    ["a trailing hyphen", "acme-"],
    ["a double hyphen", "ac--me"],
    ["an underscore", "ac_me"],
    ["a quote", 'acme"'],
    ["markup", "<x>"],
    ["a space", "ac me"],
    ["a newline", "acme\n"],
    ["empty", ""],
    ["a number", 4],
    ["null", null],
    ["an object", {}],
  ])("refuses an id that is %s", (_name, id) => {
    expect(themeIdOf(id)).toBeUndefined();
  });
});

describe("usageSnippet", () => {
  it("links the tokens and the theme file, and sets the theme on the page", () => {
    expect(usageSnippet("harbour", "harbour-lights")).toBe(
      [
        '<link rel="stylesheet" href="/tokens/index.css" />',
        '<link rel="stylesheet" href="/themes/harbour-lights.css" />',
        "",
        '<html data-theme="harbour">',
      ].join("\n"),
    );
  });
});
