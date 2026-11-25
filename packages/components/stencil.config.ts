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
  // Left to itself, Stencil groups components that share imports, and the logo sanitiser, the theme
  // generator and the emitters of the brand components ended up in the one bundle of `idg-button`
  // and 44 others. Any `bundles` entry turns that grouping off and makes every component not listed
  // a bundle of its own, which is lighter for a page of one component but makes a component that a
  // composite creates when it renders wait a round trip before it draws (the dashboard's rows were
  // in the page 200 ms before they were seen). So the components are grouped by what renders or is
  // used together, and each brand component is apart: the sanitiser is in the logo's, the guide's
  // and the export's bundles, the generator and emitters in the export's alone. A component can be
  // in one bundle only, so the shared leaves are in `controls`, which a composite of another group
  // waits for only if the page has not asked for it already. `checks/core-bundle.test.ts` holds the
  // layout: no other group loads the heavy code, and what a composite creates shares its entry.
  bundles: [
    // Leaves nearly every family uses.
    {
      components: [
        "idg-icon",
        "idg-button",
        "idg-link",
        "idg-badge",
        "idg-progress",
        "idg-alert",
        "idg-avatar",
        "idg-avatar-group",
      ],
    },
    // The form controls, and the identity forms and variation tools that render them.
    {
      components: [
        "idg-field",
        "idg-input",
        "idg-textarea",
        "idg-checkbox",
        "idg-radio",
        "idg-radio-group",
        "idg-select",
        "idg-sign-in",
        "idg-register",
        "idg-password-reset",
        "idg-profile",
        "idg-session-guard",
        "idg-property-picker",
        "idg-variation-switcher",
      ],
    },
    // The dashboard's event table creates the table, the pagination and the skeleton when its data
    // arrives.
    {
      components: [
        "idg-event-table",
        "idg-table",
        "idg-pagination",
        "idg-skeleton",
        "idg-stat",
        "idg-sparkline",
      ],
    },
    // The consent dialog and the overlays.
    {
      components: [
        "idg-consent-banner",
        "idg-consent-preferences",
        "idg-dialog",
        "idg-switch",
        "idg-popover",
        "idg-tooltip",
        "idg-toast",
        "idg-toast-region",
      ],
    },
    // The menu family, and the user menu that renders it.
    {
      components: [
        "idg-menu",
        "idg-menu-group",
        "idg-menu-item",
        "idg-menu-separator",
        "idg-user-menu",
      ],
    },
    { components: ["idg-tabs", "idg-tab", "idg-tab-panel"] },
    { components: ["idg-accordion", "idg-accordion-item"] },
    // The layout primitives and the page shell.
    {
      components: [
        "idg-stack",
        "idg-cluster",
        "idg-grid",
        "idg-cover",
        "idg-sidebar",
        "idg-switcher",
        "idg-layout",
        "idg-divider",
        "idg-card",
        "idg-breadcrumb",
        "idg-breadcrumb-item",
      ],
    },
    // Each brand component apart.
    { components: ["idg-brand-logo"] },
    { components: ["idg-brand-swatches"] },
    { components: ["idg-brand-guidelines"] },
    { components: ["idg-brand-export"] },
  ],
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
