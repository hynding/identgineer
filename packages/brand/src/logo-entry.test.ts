import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as brand from "./index.ts";
import * as logoEntry from "./logo-entry.ts";
import { runtimeImports } from "./runtime-imports.ts";

const SOURCE = fileURLToPath(new URL(".", import.meta.url));

describe("the logo entry", () => {
  it("exports the functions a component needs to show a logo, and nothing else", () => {
    expect(Object.keys(logoEntry).sort()).toEqual([
      "isSanitisedSvgLogo",
      "logoDataUrl",
      "logoImage",
    ]);
  });

  it("exports the index's own isSanitisedSvgLogo and logoDataUrl, and logoImage besides", () => {
    expect(logoEntry.logoDataUrl).toBe(brand.logoDataUrl);
    expect(logoEntry.isSanitisedSvgLogo).toBe(brand.isSanitisedSvgLogo);
    expect(typeof logoEntry.logoImage).toBe("function");
  });

  it("loads no module that needs Node or the tokens build, so a browser bundle can include it", () => {
    const { files, packages } = runtimeImports(resolve(SOURCE, "logo-entry.ts"));
    expect([...packages].sort()).toEqual([]);
    expect([...files].some((file) => file.endsWith("brand-theme-document.ts"))).toBe(false);
  });
});
