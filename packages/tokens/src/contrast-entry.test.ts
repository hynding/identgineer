import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as tokens from "./index.ts";

const PACKAGE = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", PACKAGE), "utf8")) as {
  exports: Record<string, string>;
};

describe("the contrast entry", () => {
  it("is a file of its own, so a browser bundle can take the contrast ratio and nothing more", () => {
    const entry = manifest.exports["./contrast"];
    expect(entry).toBe("./src/contrast.ts");
    const source = readFileSync(fileURLToPath(new URL(entry ?? "", PACKAGE)), "utf8");
    expect(source).not.toMatch(/^\s*(?:import|export\s+.*\sfrom)\s/m);
  });

  it("gives the same ratio as the package index", async () => {
    const entry = await import("./contrast.ts");
    expect(entry.contrastRatio).toBe(tokens.contrastRatio);
    expect(entry.relativeLuminance).toBe(tokens.relativeLuminance);
  });
});
