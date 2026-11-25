import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as brand from "./index.ts";
import * as logoEntry from "./logo-entry.ts";

const SOURCE = fileURLToPath(new URL(".", import.meta.url));
const IMPORT_SPECIFIER = /(?:from|import)\s+["']([^"']+)["']/g;

/** Every module `entry` loads at run time, by its import specifiers, with type-only imports left out. */
function runtimeImports(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    const code = readFileSync(file, "utf8")
      .replace(/import type [^;]*;/g, "")
      .replace(/export type [^;]*;/g, "");
    for (const match of code.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1] ?? "";
      if (specifier.startsWith(".")) pending.push(resolve(dirname(file), specifier));
      else packages.add(specifier);
    }
  }
  return { files, packages };
}

describe("the logo entry", () => {
  it("exports the two functions a component needs to show a logo, and nothing else", () => {
    expect(Object.keys(logoEntry).sort()).toEqual(["isSanitisedSvgLogo", "logoDataUrl"]);
  });

  it("exports the very functions the package index does", () => {
    expect(logoEntry.logoDataUrl).toBe(brand.logoDataUrl);
    expect(logoEntry.isSanitisedSvgLogo).toBe(brand.isSanitisedSvgLogo);
  });

  it("loads no module that needs Node or the tokens build, so a browser bundle can include it", () => {
    const { files, packages } = runtimeImports(resolve(SOURCE, "logo-entry.ts"));
    expect([...packages].sort()).toEqual([]);
    expect([...files].some((file) => file.endsWith("brand-theme-document.ts"))).toBe(false);
  });
});
