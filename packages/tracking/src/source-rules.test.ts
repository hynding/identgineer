import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIRECTORY = new URL("./", import.meta.url);

/** The package's own source: not its tests, its test harness or its fakes. */
const sources = readdirSync(DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => entry.name)
  .filter((name) => !name.endsWith(".test.ts") && name !== "test-harness.ts")
  .map((name) => ({ name, text: readFileSync(new URL(name, DIRECTORY), "utf8") }));

const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const filesMatching = (pattern: RegExp): string[] =>
  sources.filter(({ text }) => pattern.test(withoutComments(text))).map(({ name }) => name);

describe("the tracking source", () => {
  it("finds its own source files, so the rules below cannot pass on nothing", () => {
    expect(sources.map(({ name }) => name)).toEqual(
      expect.arrayContaining(["create-tracker.ts", "delivery.ts", "parse-tracking-batch.ts"]),
    );
  });

  it.each([
    ["eval", /\beval\s*\(/],
    ["Function", /\bnew\s+Function\b|\bFunction\s*\(/],
    ["innerHTML", /\binnerHTML\b|\bouterHTML\b|\binsertAdjacentHTML\b/],
    ["document.write", /\bdocument\.write/],
    ["an inline script or style", /<script|<style|createElement\s*\(/],
    ["a timer given a string", /setTimeout\s*\(\s*["'`]/],
    ["console", /\bconsole\b/],
    ["a cookie", /\bcookie\b/i],
    ["indexedDB, the Cache API or a service worker", /indexedDB|\bcaches\b|serviceWorker/],
    ["XMLHttpRequest or WebSocket", /XMLHttpRequest|WebSocket/],
    ["any", /:\s*any\b|\bas\s+any\b|<any>/],
  ])("never uses %s", (_label, pattern) => {
    expect(filesMatching(pattern)).toEqual([]);
  });

  it("reads the browser's storage globals in one file only", () => {
    expect(filesMatching(/\bglobalThis\b[^;]*\b(local|session)Storage\b|\[area\]/)).toEqual([
      "storage.ts",
    ]);
  });

  it("takes randomness for identifiers from crypto, and Math.random only for retry jitter", () => {
    expect(filesMatching(/Math\.random/)).toEqual(["resolve-options.ts"]);
  });

  it("makes no network request but through the injected fetch and beacon", () => {
    expect(filesMatching(/\bglobalThis\.fetch\b|\bnavigator\.sendBeacon\b/).sort()).toEqual([
      "resolve-options.ts",
    ]);
  });

  it("has nothing to do at import: no top-level call outside constants", () => {
    for (const { name, text } of sources) {
      const topLevel = withoutComments(text)
        .split("\n")
        .filter(
          (line) =>
            /^[a-zA-Z(]/.test(line) &&
            !/^(export|import|const|type|interface|function|class|let|\}|\)|\/)/.test(line),
        );
      expect(topLevel, name).toEqual([]);
    }
  });
});
