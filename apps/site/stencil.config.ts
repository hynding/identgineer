import type { Config } from "@stencil/core";
import ts from "typescript";

const TRANSPILED_SOURCES = [
  "/packages/variations/src/",
  "/packages/brand/src/",
  "/packages/tokens/src/",
];

// The workspace packages are consumed as TypeScript source, and Stencil only compiles what its own
// tsconfig includes. So their files alone are transpiled here, one by one, as the components
// package does: types are erased and imports left as written. A type error in that source is caught
// by `pnpm typecheck`, never by this build.
const transpileWorkspaceSources = {
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

export const config: Config = {
  namespace: "site",
  tsconfig: "tsconfig.build.json",
  // The lazy loader would otherwise inject a <style> through innerHTML to hide components before
  // hydration, which the site's policy and Trusted Types both refuse. Prerendered components are
  // drawn already, so there is nothing to hide.
  invisiblePrehydration: false,
  rollupPlugins: { before: [transpileWorkspaceSources] },
  outputTargets: [
    {
      type: "www",
      serviceWorker: null,
      buildDir: "build",
      // The pages themselves are written by scripts/prerender.ts, from the hydrate build below.
      copy: [
        { src: "assets/favicon.svg", dest: "favicon.svg" },
        { src: "styles/site.css", dest: "assets/site.css" },
        { src: "../node_modules/@identgineer/tokens/dist/index.css", dest: "assets/tokens.css" },
        {
          src: "../node_modules/@identgineer/variations/dist/bootstrap.js",
          dest: "assets/bootstrap.js",
        },
      ],
    },
    { type: "dist-hydrate-script", dir: "hydrate" },
  ],
};
