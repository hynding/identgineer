import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

// A fixture loads an SDK and its fakes as plain ES modules from its own origin, so the strict
// policy (script-src 'self') holds.

/**
 * The modules of a fixture's own, from the components' source: the dashboard seam, its fake, and
 * the two helpers the fake sorts and shortens with. Listed, since the components' source is mostly
 * Stencil components, which a page loads from the build and never as plain modules.
 */
export const DASHBOARD_FIXTURE_ONLY = [
  "dashboard/dashboard-types.ts",
  "dashboard/parse-dashboard-data.ts",
  "dashboard/validated-source.ts",
  "testing/fake-dashboard-source.ts",
  "components/event-table/event-table-model.ts",
  "utils/untrusted-text.ts",
] as const;

/**
 * The SDK's source modules a fixture needs: no tests, no test harness, and nothing in `leftOut`
 * (paths relative to the source, such as a node-only lock manager and the testing index that
 * re-exports it). With `only`, nothing but those paths (relative to the source, with `/`).
 */
export function sdkModules(
  source: string,
  leftOut: readonly string[],
  only?: readonly string[],
): string[] {
  const excluded = new Set(leftOut.map((path) => path.split("/").join(sep)));
  const wanted =
    only === undefined ? undefined : new Set(only.map((path) => path.split("/").join(sep)));
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      const name = relative(source, path);
      const included =
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        !excluded.has(name) &&
        (wanted === undefined || wanted.has(name));
      return included && name !== "test-harness.ts" ? [path] : [];
    });
  return walk(source).sort();
}

// The components' own source imports without an extension (Bundler resolution), which a browser
// cannot resolve. Only an import or export of a relative path with no extension is rewritten.
const EXTENSIONLESS_IMPORT = /(\bfrom\s+["'])(\.{1,2}\/[^"'.]*(?:\.[^"'./]+)*?)(["'])/g;

/**
 * One SDK module as browser JavaScript: types erased and `./x.ts` specifiers rewritten to
 * `./x.js`, as are extensionless ones. Transpilation only; `pnpm typecheck` checks the types.
 */
export function transpileSdkModule(code: string, fileName: string): string {
  const output = ts.transpileModule(code, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      rewriteRelativeImportExtensions: true,
    },
  }).outputText;
  return output.replace(
    EXTENSIONLESS_IMPORT,
    (match, before: string, path: string, after: string) =>
      /\.(?:js|mjs|json)$/.test(path) ? match : `${before}${path}.js${after}`,
  );
}

/** The output path of a module, `.ts` replaced by `.js`, with forward slashes. */
export function outputName(source: string, path: string): string {
  return relative(source, path).split(sep).join("/").replace(/\.ts$/, ".js");
}

export function readModule(path: string): string {
  return readFileSync(path, "utf8");
}
