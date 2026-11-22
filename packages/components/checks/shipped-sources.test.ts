import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
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

// The identity components take the client the page creates; the SDK and its fake are only for
// tests, so no shipped source may load them. A type import is erased, but none is needed either:
// the components declare what they use in src/identity/identity-types.ts.
describe("shipped component sources and the identity SDK", () => {
  // src/testing holds the unit tests' helpers, which the build leaves out.
  const shipped = sources.filter((file) => !relative(SRC, file).startsWith(`testing${sep}`));

  it("finds the identity components' sources, so the check cannot pass on nothing", () => {
    expect(shipped.some((file) => file.endsWith("sign-in.tsx"))).toBe(true);
  });

  it.each(shipped.map((file) => [relative(SRC, file), file] as const))(
    "%s does not import @identgineer/identity",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).not.toMatch(/["']@identgineer\/identity(?:\/[^"']*)?["']/);
    },
  );
});
