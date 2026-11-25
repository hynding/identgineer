import type { Config } from "@stencil/core";
import ts from "typescript";

const TRANSPILED_SOURCES = [
  "/packages/variations/src/",
  "/packages/brand/src/",
  "/packages/tokens/src/",
];

// @identgineer/variations is consumed as TypeScript source, like every workspace package. Stencil
// only compiles what its own tsconfig includes, and including a sibling package's source would
// make it emit that package's files next to this one. So the files of that package alone are
// transpiled here, one by one, which erases types and leaves every import as written. That is
// transpilation only: a type error in that source is caught by `pnpm typecheck`, never by this build.
const transpileVariations = {
  name: "transpile-variations",
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
  namespace: "identgineer",
  tsconfig: "tsconfig.build.json",
  // The lazy loader would otherwise inject a <style> through innerHTML to hide components
  // before hydration, which a strict CSP and Trusted Types both refuse.
  invisiblePrehydration: false,
  rollupPlugins: { before: [transpileVariations] },
  outputTargets: [
    { type: "dist", esmLoaderPath: "../loader" },
    { type: "dist-custom-elements" },
    { type: "docs-json", file: "dist/docs.json" },
    {
      type: "www",
      serviceWorker: null,
      // csp-demo.html is copied untouched: the www build inlines scripts and styles into index.html,
      // which a strict CSP forbids, and that page is what checks the library itself under one.
      copy: [
        { src: "demo.css" },
        { src: "demo.js" },
        { src: "csp-demo.html" },
        // The browser fixtures live outside src: Stencil copies every script and SVG under src into
        // the dist collection, and test pages are not part of the package.
        { src: "../fixtures", dest: "fixtures" },
        { src: "../../tokens/dist", dest: "tokens" },
        // The variation switcher fixture loads the bootstrap script as a page would, from its own
        // origin. The file comes from the variations build, which runs first because this package
        // depends on it, and is served at /variations/bootstrap.js.
        { src: "../../variations/dist/bootstrap.js", dest: "variations/bootstrap.js" },
      ],
    },
  ],
};
