import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as emitEntry from "./emit-entry.ts";
import * as brand from "./index.ts";
import { isNodeBuiltin, runtimeImports } from "./runtime-imports.ts";

const SOURCE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = resolve(SOURCE, "../..");
const TOKENS = resolve(PACKAGES, "tokens");
const tokensManifest = JSON.parse(readFileSync(resolve(TOKENS, "package.json"), "utf8")) as {
  exports: Record<string, string>;
};

/** The file a `@identgineer/tokens` specifier names, by the package's own `exports`. */
function tokensFile(specifier: string): string | undefined {
  const subpath =
    specifier === "@identgineer/tokens" ? "." : specifier.replace(/^@identgineer\/tokens/, ".");
  const target = specifier.startsWith("@identgineer/tokens")
    ? tokensManifest.exports[subpath]
    : undefined;
  return target === undefined ? undefined : resolve(TOKENS, target);
}

describe("the emit entry", () => {
  it("exports the two emitters, and nothing else", () => {
    expect(Object.keys(emitEntry).sort()).toEqual(["emitBrandThemeCss", "emitBrandThemeTokens"]);
  });

  it("exports the index's own emitters", () => {
    expect(emitEntry.emitBrandThemeCss).toBe(brand.emitBrandThemeCss);
    expect(emitEntry.emitBrandThemeTokens).toBe(brand.emitBrandThemeTokens);
  });

  describe("the modules it loads, the tokens package's among them", () => {
    const graph = runtimeImports(resolve(SOURCE, "emit-entry.ts"), tokensFile);
    const code = [...graph.files]
      .filter((file) => file.endsWith(".ts"))
      .map((file) => [file, readFileSync(file, "utf8")] as const);

    it("walk past both packages, so the check reads what the emitters really load", () => {
      const names = [...graph.files].map((file) => relative(PACKAGES, file));
      expect(names.some((name) => name === "tokens/src/emit-css.ts")).toBe(true);
      expect(names.some((name) => name === "brand/src/emit-brand-theme.ts")).toBe(true);
      expect(names.some((name) => name === "tokens/src/tokens/primitive.json")).toBe(true);
      expect(code.length).toBeGreaterThan(50);
    });

    it("name no package beyond the two workspace ones, and no Node module", () => {
      expect([...graph.packages]).toEqual([]);
      expect([...graph.packages].filter(isNodeBuiltin)).toEqual([]);
    });

    it("read nothing from the disk, the network or the environment", () => {
      const reading = code
        .filter(([, text]) =>
          /\bimport\.meta\b|\bprocess\s*\.|\brequire\s*\(|\bfetch\s*\(|\breadFile|\bfs\b/.test(
            text,
          ),
        )
        .map(([file]) => relative(PACKAGES, file));
      expect(reading).toEqual([]);
    });

    it("do not include the build script that writes the token files", () => {
      expect([...graph.files].some((file) => /build-token-files|scripts\/build/.test(file))).toBe(
        false,
      );
    });
  });
});
