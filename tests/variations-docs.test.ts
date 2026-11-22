import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as runtime from "../packages/variations/src/index.ts";
import * as bootstrapTag from "../packages/variations/src/bootstrap-tag.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "docs", "variations");
const GUIDES = ["plain-html.md", "react.md", "vue.md", "angular.md"];

const read = (path: string) => readFileSync(path, "utf8");

/** The code in fenced blocks, so prose that mentions a name is not mistaken for an import. */
function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((match) => match[1] ?? "");
}

interface Import {
  readonly source: string;
  readonly name: string;
  readonly typeOnly: boolean;
}

const IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["'](@identgineer\/variations[^"']*)["']/g;

function importsOf(markdown: string): Import[] {
  return codeBlocks(markdown).flatMap((block) =>
    [...block.matchAll(IMPORT)].flatMap((match) =>
      (match[2] ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "")
        .map((entry) => {
          const inline = /^type\s+/.test(entry);
          const name = entry.replace(/^type\s+/, "").split(/\s+as\s+/)[0] ?? "";
          return { source: match[3] ?? "", name, typeOnly: inline || match[1] !== undefined };
        }),
    ),
  );
}

// Types have no runtime export to look up, so they are read from the entry's `export type` lists.
const ENTRY_SOURCE = read(join(ROOT, "packages", "variations", "src", "index.ts"));
const TYPE_NAMES = new Set(
  [...ENTRY_SOURCE.matchAll(/export type \{([^}]*)\}/g)].flatMap((match) =>
    (match[1] ?? "").split(",").map((name) => name.trim()),
  ),
);
const RUNTIME_NAMES = new Set(Object.keys(runtime));
const EXPORTS_MAP = (
  JSON.parse(read(join(ROOT, "packages", "variations", "package.json"))) as {
    exports: Record<string, string>;
  }
).exports;

function isExported(source: string, name: string, typeOnly: boolean): boolean {
  if (source === "@identgineer/variations") {
    return RUNTIME_NAMES.has(name) || (typeOnly && TYPE_NAMES.has(name));
  }
  if (source === "@identgineer/variations/bootstrap-tag") return name in bootstrapTag;
  return false;
}

describe("the variations adoption guides", () => {
  it("exist, one file for each way of adopting the runtime", () => {
    expect(readdirSync(DOCS).sort()).toEqual([...GUIDES].sort());
  });

  describe.each(GUIDES)("%s", (guide) => {
    const markdown = read(join(DOCS, guide));
    const imports = importsOf(markdown);

    it("imports from the package in at least one example, except the plain HTML guide", () => {
      if (guide !== "plain-html.md") expect(imports.length).toBeGreaterThan(0);
    });

    it("imports only from entry points the package has", () => {
      for (const { source } of imports) {
        const subpath = source.replace("@identgineer/variations", ".") || ".";
        expect(Object.keys(EXPORTS_MAP), source).toContain(subpath);
      }
    });

    it("imports only names the package really exports", () => {
      const missing = imports
        .filter(({ source, name, typeOnly }) => !isExported(source, name, typeOnly))
        .map(({ source, name }) => `${name} from ${source}`);
      expect(missing).toEqual([]);
    });

    it("is self-contained: it says how the attributes alone work", () => {
      expect(markdown).toContain("data-theme");
    });
  });

  it("recognises a name that is not exported, so the check cannot pass on nothing", () => {
    expect(isExported("@identgineer/variations", "applyVariations", false)).toBe(true);
    expect(isExported("@identgineer/variations", "useVariations", false)).toBe(false);
    expect(isExported("@identgineer/variations", "VariationState", false)).toBe(false);
    expect(isExported("@identgineer/variations", "VariationState", true)).toBe(true);
    expect(isExported("@identgineer/variations/bootstrap-tag", "bootstrapScriptAttributes", false)).toBe(
      true,
    );
  });

  it("are linked from the root README and from the variations README", () => {
    for (const readme of ["README.md", join("packages", "variations", "README.md")]) {
      const text = read(join(ROOT, readme));
      for (const guide of GUIDES) expect(text, `${readme} links ${guide}`).toContain(`docs/variations/${guide}`);
    }
  });
});
