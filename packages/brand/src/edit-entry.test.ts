import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as editEntry from "./edit-entry.ts";
import * as brand from "./index.ts";
import { isNodeBuiltin, runtimeImports } from "./runtime-imports.ts";

const SOURCE = fileURLToPath(new URL(".", import.meta.url));
const PACKAGES = resolve(SOURCE, "../..");
const TOKENS = resolve(PACKAGES, "tokens");
const tokensManifest = JSON.parse(readFileSync(resolve(TOKENS, "package.json"), "utf8")) as {
  exports: Record<string, string>;
};

function tokensFile(specifier: string): string | undefined {
  const subpath =
    specifier === "@identgineer/tokens" ? "." : specifier.replace(/^@identgineer\/tokens/, ".");
  const target = specifier.startsWith("@identgineer/tokens")
    ? tokensManifest.exports[subpath]
    : undefined;
  return target === undefined ? undefined : resolve(TOKENS, target);
}

describe("the edit entry", () => {
  it("exports what an editor of a kit needs, and nothing else", () => {
    expect(Object.keys(editEntry).sort()).toEqual([
      "NAME_MAX_LENGTH",
      "SVG_LOGO_LIMITS",
      "TAGLINE_MAX_LENGTH",
      "generateBrandTheme",
      "parseBrandKit",
      "sanitiseSvgLogo",
    ]);
  });

  it("exports the index's own values", () => {
    expect(editEntry.parseBrandKit).toBe(brand.parseBrandKit);
    expect(editEntry.generateBrandTheme).toBe(brand.generateBrandTheme);
    expect(editEntry.sanitiseSvgLogo).toBe(brand.sanitiseSvgLogo);
    expect(editEntry.SVG_LOGO_LIMITS).toBe(brand.SVG_LOGO_LIMITS);
    expect(editEntry.NAME_MAX_LENGTH).toBe(brand.NAME_MAX_LENGTH);
    expect(editEntry.TAGLINE_MAX_LENGTH).toBe(brand.TAGLINE_MAX_LENGTH);
  });

  describe("the modules it loads, the tokens package's among them", () => {
    const graph = runtimeImports(resolve(SOURCE, "edit-entry.ts"), tokensFile);
    const code = [...graph.files]
      .filter((file) => file.endsWith(".ts"))
      .map((file) => [file, readFileSync(file, "utf8")] as const);

    it("walk past both packages, so the check reads what the editor really loads", () => {
      const names = [...graph.files].map((file) => relative(PACKAGES, file));
      expect(names).toContain("brand/src/generate-brand-theme.ts");
      expect(names).toContain("brand/src/sanitise-svg-logo.ts");
      expect(code.length).toBeGreaterThan(40);
    });

    it("name no package beyond the two workspace ones, and no Node module", () => {
      expect([...graph.packages]).toEqual([]);
      expect([...graph.packages].filter(isNodeBuiltin)).toEqual([]);
    });

    it("hold neither the store nor the brand emitters, which an editor does not call", () => {
      const names = [...graph.files].map((file) => relative(PACKAGES, file));
      expect(names).not.toContain("brand/src/brand-kit-store.ts");
      expect(names).not.toContain("brand/src/emit-brand-theme.ts");
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
  });
});
