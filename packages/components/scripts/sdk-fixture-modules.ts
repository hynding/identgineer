import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

// A fixture loads an SDK and its fakes as plain ES modules from its own origin, so the strict
// policy (script-src 'self') holds.

/**
 * The SDK's source modules a fixture needs: no tests, no test harness, and nothing in `leftOut`
 * (paths relative to the source, such as a node-only lock manager and the testing index that
 * re-exports it).
 */
export function sdkModules(source: string, leftOut: readonly string[]): string[] {
  const excluded = new Set(leftOut.map((path) => path.split("/").join(sep)));
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      const name = relative(source, path);
      const wanted =
        entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !excluded.has(name);
      return wanted && name !== "test-harness.ts" ? [path] : [];
    });
  return walk(source).sort();
}

/**
 * One SDK module as browser JavaScript: types erased and `./x.ts` specifiers rewritten to
 * `./x.js`. Transpilation only; `pnpm typecheck` checks the types.
 */
export function transpileSdkModule(code: string, fileName: string): string {
  return ts.transpileModule(code, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      rewriteRelativeImportExtensions: true,
    },
  }).outputText;
}

/** The output path of a module, `.ts` replaced by `.js`, with forward slashes. */
export function outputName(source: string, path: string): string {
  return relative(source, path).split(sep).join("/").replace(/\.ts$/, ".js");
}

export function readModule(path: string): string {
  return readFileSync(path, "utf8");
}
