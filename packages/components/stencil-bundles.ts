/**
 * The bundles of the lazy build: each group is one entry a page loads, and a component is in
 * exactly one. Left to itself, Stencil groups components that share imports, and the logo
 * sanitiser, the theme generator and the emitters of the brand components ended up in the one
 * bundle of `idg-button` and 44 others. Any `bundles` entry turns that grouping off and makes every
 * component not listed a bundle of its own, which is lighter for a page of one component but makes
 * a component that a composite creates when it renders wait a round trip before it draws (the
 * dashboard's rows were in the page 200 ms before they were seen). So the components are grouped
 * by what renders or is used together, and each brand component is apart: the sanitiser is in the
 * logo's, the guide's and the export's bundles, the generator and emitters in the export's alone.
 *
 * A component can be in one bundle only, so the leaves most families use (the skeleton and the
 * switch too, which the profile renders) are in `controls`, which a composite of another group
 * waits one round trip for unless the page has asked for it already. `controls` has no chunk of
 * its own: it holds copies of the helpers it shares (`utils/controls-copies.ts`), since a chunk
 * shared with another entry is fetched only after the first entry arrives.
 * `checks/core-bundle.test.ts` reads this list and the component sources: every component is in a
 * group, and what a component renders is in its own group or in `controls`.
 */
export const BUNDLES: readonly { readonly name: string; readonly components: readonly string[] }[] =
  [
    {
      name: "controls",
      components: [
        "idg-icon",
        "idg-button",
        "idg-link",
        "idg-badge",
        "idg-progress",
        "idg-alert",
        "idg-avatar",
        "idg-avatar-group",
        "idg-skeleton",
        "idg-switch",
      ],
    },
    {
      name: "forms",
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
    {
      name: "dashboard",
      components: ["idg-event-table", "idg-table", "idg-pagination", "idg-stat", "idg-sparkline"],
    },
    {
      name: "consent",
      components: [
        "idg-consent-banner",
        "idg-consent-preferences",
        "idg-dialog",
        "idg-popover",
        "idg-tooltip",
        "idg-toast",
        "idg-toast-region",
      ],
    },
    {
      name: "menus",
      components: [
        "idg-menu",
        "idg-menu-group",
        "idg-menu-item",
        "idg-menu-separator",
        "idg-user-menu",
      ],
    },
    { name: "tabs", components: ["idg-tabs", "idg-tab", "idg-tab-panel"] },
    { name: "accordion", components: ["idg-accordion", "idg-accordion-item"] },
    {
      name: "layout",
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
    { name: "brand-logo", components: ["idg-brand-logo"] },
    { name: "brand-swatches", components: ["idg-brand-swatches"] },
    { name: "brand-guidelines", components: ["idg-brand-guidelines"] },
    { name: "brand-export", components: ["idg-brand-export"] },
  ];
