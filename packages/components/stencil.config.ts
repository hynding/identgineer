import type { Config } from "@stencil/core";
import { BUNDLES } from "./stencil-bundles";
import { transpileWorkspaceSources } from "./stencil-workspace-sources";

export const config: Config = {
  namespace: "identgineer",
  tsconfig: "tsconfig.build.json",
  // The lazy loader would otherwise inject a <style> through innerHTML to hide components
  // before hydration, which a strict CSP and Trusted Types both refuse.
  invisiblePrehydration: false,
  rollupPlugins: { before: [transpileWorkspaceSources] },
  // Which components share a bundle is decided in `stencil-bundles.ts`, where its reasons are.
  bundles: BUNDLES.map(({ components }) => ({ components: [...components] })),
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
