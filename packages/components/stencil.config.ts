import type { Config } from "@stencil/core";

export const config: Config = {
  namespace: "identgineer",
  tsconfig: "tsconfig.build.json",
  // The lazy loader would otherwise inject a <style> through innerHTML to hide components
  // before hydration, which a strict CSP and Trusted Types both refuse.
  invisiblePrehydration: false,
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
        { src: "csp-demo.html" },
        { src: "../../tokens/dist", dest: "tokens" },
      ],
    },
  ],
};
