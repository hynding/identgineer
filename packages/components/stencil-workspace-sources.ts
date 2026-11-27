import ts from "typescript";

const TRANSPILED_SOURCES = [
  "/packages/variations/src/",
  "/packages/brand/src/",
  "/packages/tokens/src/",
];

/**
 * The workspace packages are consumed as TypeScript source. Stencil only compiles what its own
 * tsconfig includes, and including a sibling package's source would make it emit that package's
 * files next to the project's own. So the files of those packages alone are transpiled here, one by
 * one, which erases types and leaves every import as written. That is transpilation only: a type
 * error in that source is caught by `pnpm typecheck`, never by a build. The components package and
 * the site both build with it.
 */
export const transpileWorkspaceSources = {
  name: "transpile-workspace-sources",
  transform(code: string, id: string): { code: string; map: null } | null {
    // Module ids use backslashes on Windows.
    const path = id.replaceAll("\\", "/");
    if (!TRANSPILED_SOURCES.some((source) => path.includes(source)) || !id.endsWith(".ts")) {
      return null;
    }
    const { outputText } = ts.transpileModule(code, {
      fileName: id,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true,
        isolatedModules: true,
      },
    });
    return { code: outputText, map: null };
  },
};
