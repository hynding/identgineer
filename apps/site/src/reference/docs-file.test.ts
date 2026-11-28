import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readDocsFile } from "./docs-file.ts";

const directory = mkdtempSync(join(tmpdir(), "idg-docs-"));
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("reading the components package's docs.json from disk", () => {
  it("gives the component records of a file", () => {
    const file = join(directory, "docs.json");
    writeFileSync(file, JSON.stringify({ components: [{ tag: "idg-a", docs: "A." }] }));
    expect(readDocsFile(file).map((record) => record.tag)).toEqual(["idg-a"]);
  });

  it("says to build the components package when the file is not there", () => {
    expect(() => readDocsFile(join(directory, "missing.json"))).toThrow(
      /pnpm --filter @identgineer\/components build/,
    );
  });

  it("says which file is not JSON", () => {
    const file = join(directory, "broken.json");
    writeFileSync(file, "{ not json");
    expect(() => readDocsFile(file)).toThrow(/broken\.json is not JSON/);
  });
});
