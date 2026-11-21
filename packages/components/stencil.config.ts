import type { Config } from "@stencil/core";

export const config: Config = {
  namespace: "identgineer",
  // The lazy loader would otherwise inject a <style> through innerHTML to hide
  // components before hydration, which a strict CSP and Trusted Types both refuse.
  invisiblePrehydration: false,
  outputTargets: [
    { type: "dist", esmLoaderPath: "../loader" },
    { type: "dist-custom-elements" },
    { type: "docs-json", file: "dist/docs.json" },
    {
      type: "www",
      serviceWorker: null,
      copy: [{ src: "../../tokens/dist", dest: "tokens" }],
    },
  ],
};
