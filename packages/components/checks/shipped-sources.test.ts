import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findCssViolations } from "./css-rules";
import { findSourceViolations } from "./source-rules";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const allFiles = listFiles(SRC);
const isTestFile = (file: string) => /\.(?:test|spec)\.tsx?$/.test(file);
const stylesheets = allFiles.filter((file) => file.endsWith(".css"));
const sources = allFiles.filter(
  (file) => /\.tsx?$/.test(file) && !file.endsWith(".d.ts") && !isTestFile(file),
);

describe("shipped component stylesheets", () => {
  it("finds the stylesheets, so the check cannot pass on nothing", () => {
    expect(stylesheets.length).toBeGreaterThanOrEqual(2);
  });

  it.each(stylesheets.map((file) => [relative(SRC, file), file] as const))(
    "%s uses only --idg-* tokens for colour and motion",
    (_name, file) => {
      expect(findCssViolations(readFileSync(file, "utf8"))).toEqual([]);
    },
  );
});

describe("shipped component sources", () => {
  it("finds the sources, so the check cannot pass on nothing", () => {
    expect(sources.some((file) => file.endsWith("button.tsx"))).toBe(true);
  });

  it.each(sources.map((file) => [relative(SRC, file), file] as const))(
    "%s has no injection or CSP-breaking APIs",
    (_name, file) => {
      expect(findSourceViolations(readFileSync(file, "utf8"))).toEqual([]);
    },
  );
});
