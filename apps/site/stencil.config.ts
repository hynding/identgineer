import type { Config } from "@stencil/core";
import { transpileWorkspaceSources } from "@identgineer/components/stencil-workspace-sources";

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
      // src/assets, the icon, is copied to www/assets as it is.
      copy: [
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
