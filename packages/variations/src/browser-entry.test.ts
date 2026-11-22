import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENTRY = fileURLToPath(new URL("./index.ts", import.meta.url));

const IMPORT_SPECIFIER =
  /^\s*(?:import|export)(?!\s+type\b)[^'"]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;

/** Every module reachable from the entry through value imports; type-only imports are erased. */
function importGraph(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const visit = (file: string): void => {
    if (graph.has(file)) return;
    const specifiers = [...readFileSync(file, "utf8").matchAll(IMPORT_SPECIFIER)].map(
      (match) => match[1] ?? match[2] ?? "",
    );
    graph.set(file, specifiers);
    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) visit(resolve(dirname(file), specifier));
    }
  };
  visit(entry);
  return graph;
}

describe("the browser entry point", () => {
  const graph = importGraph(ENTRY);
  const specifiers = [...graph.values()].flat();

  it("walks the real graph", () => {
    expect(graph.size).toBeGreaterThan(8);
  });

  it("imports no package at all: not the tokens pipeline, not node:", () => {
    expect(specifiers.filter((specifier) => !specifier.startsWith("."))).toEqual([]);
  });

  it("reaches no bootstrap build or generator code", () => {
    const files = [...graph.keys()].map((file) => file.replaceAll("\\", "/"));
    expect(files.filter((file) => /bootstrap-(files|tag)|\/scripts\//.test(file))).toEqual([]);
  });
});

async function bundleSize(): Promise<number> {
  const here = createRequire(import.meta.url);
  const viteRequire = createRequire(
    createRequire(here.resolve("vitest/package.json")).resolve("vite/package.json"),
  );
  const { build } = (await import(viteRequire.resolve("rolldown"))) as {
    build: (options: unknown) => Promise<{ output: { code: string }[] }>;
  };
  const result = await build({
    input: ENTRY,
    platform: "browser",
    write: false,
    output: { format: "esm", minify: true },
  });
  return Buffer.byteLength(result.output[0]?.code ?? "");
}

describe("the bundled browser entry", () => {
  // Measured after the tokens pipeline was removed, plus about 25% headroom.
  const BUDGET_BYTES = 0;

  it("stays inside its size budget", async () => {
    const size = await bundleSize();
    expect(BUDGET_BYTES).toBeGreaterThan(0);
    expect(size).toBeLessThan(BUDGET_BYTES);
  });

  it("contains no token pipeline", async () => {
    const here = createRequire(import.meta.url);
    const viteRequire = createRequire(
      createRequire(here.resolve("vitest/package.json")).resolve("vite/package.json"),
    );
    const { build } = (await import(viteRequire.resolve("rolldown"))) as {
      build: (options: unknown) => Promise<{ output: { code: string }[] }>;
    };
    const result = await build({
      input: ENTRY,
      platform: "browser",
      write: false,
      output: { format: "esm" },
    });
    expect(result.output[0]?.code).not.toMatch(/\$value|resolveAliases|node:fs/);
  });
});
