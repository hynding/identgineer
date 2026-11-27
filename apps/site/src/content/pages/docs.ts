import { bullets, h2, link, p, page, repository, type Piece } from "../authoring";

/** One topic's four framework guides, as "Topic: plain HTML, React, Vue and Angular". */
function guides(topic: string, folder: string): Piece[] {
  const guide = (file: string, name: string) => link(repository(`docs/${folder}/${file}.md`), name);
  return [
    `${topic}: `,
    guide("plain-html", "plain HTML"),
    ", ",
    guide("react", "React"),
    ", ",
    guide("vue", "Vue"),
    " and ",
    guide("angular", "Angular"),
  ];
}

export const DOCS = page({
  slug: "docs",
  title: "Documentation",
  summary:
    "How to put Identgineer's packages to work in a page or an app, how its looks are made, and what it does for a page's security.",
  body: [
    p(
      "Start with the three guides here. The guides for each framework and the READMEs of the packages are in the repository, and say everything the site does not yet.",
    ),
    h2("The guides"),
    bullets(
      [
        link("/docs/getting-started/", "Getting started"),
        ": build the packages, copy three files to your site and put a first themed page together.",
      ],
      [
        link("/docs/theming/", "Theming guide"),
        ": the four variation axes, the tokens, a visitor's choice without a flash, and a theme from a brand kit.",
      ],
      [
        link("/docs/security/", "Security notes"),
        ": what the components, the identity client and the tracker do for you, and what your server must do.",
      ],
    ),
    h2("For your framework"),
    p(
      "Each topic has a guide for a plain page and for three frameworks, using only what exists today:",
    ),
    bullets(
      guides("Variations", "variations"),
      guides("Identity", "identity"),
      guides("Consent", "consent"),
      guides("Dashboard", "dashboard"),
    ),
    h2("The packages"),
    bullets(
      [
        link(repository("packages/tokens/README.md"), "@identgineer/tokens"),
        ": design tokens, eight themes, designs, layouts and UX modes",
      ],
      [
        link(repository("packages/variations/README.md"), "@identgineer/variations"),
        ": the runtime for the four axes and the bootstrap script",
      ],
      [
        link(repository("packages/components/README.md"), "@identgineer/components"),
        ": every idg- element, its properties, slots and parts",
      ],
      [
        link(repository("packages/identity/README.md"), "@identgineer/identity"),
        ": the accounts client and its security model",
      ],
      [
        link(repository("packages/tracking/README.md"), "@identgineer/tracking"),
        ": the tracker, its wire format and the dashboard's reads",
      ],
      [
        link(repository("packages/brand/README.md"), "@identgineer/brand"),
        ": brand kits, generated themes and the logo sanitiser",
      ],
    ),
    p(
      "A reference of every component, generated from the library itself, will come with the components page. Until then the components README is the reference.",
    ),
  ],
});
