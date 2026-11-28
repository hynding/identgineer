import { bullets, code, h2, link, note, p, page, repository, sample, table } from "../authoring.ts";

export const GETTING_STARTED = page({
  slug: "getting-started",
  title: "Getting started",
  summary:
    "Build the packages from the repository, serve a few of their files from your own site, and put a first themed page together. Nothing is on npm yet.",
  body: [
    h2("What you need"),
    bullets(
      "Node.js 22.13 or newer",
      ["pnpm 10, which ", code("corepack enable"), " sets up at the version the repository names"],
      "A site that serves static files from its own origin: nothing is loaded from anywhere else",
    ),
    h2("Build the packages"),
    sample(
      "sh",
      `
git clone https://github.com/hynding/identgineer.git
cd identgineer
corepack enable
pnpm install
pnpm build
`,
      "In a terminal",
    ),
    p(
      "The build writes each package's ",
      code("dist"),
      " folder. No package is published yet, so a page uses these built files, copied to its own origin.",
    ),
    h2("Copy the files to your site"),
    table(
      "What a page loads, and where it comes from",
      ["File", "Copy from", "Serve at"],
      [
        [
          "The tokens stylesheet",
          code("packages/tokens/dist/index.css"),
          code("/tokens/index.css"),
        ],
        [
          "The bootstrap script",
          code("packages/variations/dist/bootstrap.js"),
          code("/variations/bootstrap.js"),
        ],
        [
          "The components",
          ["The whole of ", code("packages/components/dist/identgineer/")],
          code("/build/"),
        ],
      ],
    ),
    p(
      "The bootstrap script's integrity value is in ",
      code("bootstrap.sri.json"),
      ", beside it. The components' loader fetches each one from the same folder when a page first uses it.",
    ),
    h2("A first page"),
    sample(
      "html",
      `
<!doctype html>
<html lang="en" data-theme="ember" data-design="flat" data-layout="top-bar" data-ux="comfortable">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="/variations/bootstrap.js" integrity="sha384-COPY-FROM-bootstrap.sri.json"></script>
    <title>My page</title>
    <link rel="stylesheet" href="/tokens/index.css" />
    <link rel="stylesheet" href="/site.css" />
    <script type="module" src="/build/identgineer.esm.js"></script>
  </head>
  <body>
    <idg-layout>
      <a slot="brand" href="/">My site</a>
      <a slot="navigation" href="/">Home</a>
      <h1>Hello</h1>
      <idg-button>Save</idg-button>
    </idg-layout>
  </body>
</html>
`,
      "index.html",
    ),
    bullets(
      [
        "The bootstrap script comes first and blocks: no ",
        code("async"),
        ", ",
        code("defer"),
        " or ",
        code('type="module"'),
        ". It sets a visitor's stored or shared choice on the root before anything is painted.",
      ],
      [
        "The four ",
        code("data-"),
        " attributes choose the look. Leave any out and it takes its default.",
      ],
      [
        code("idg-layout"),
        " is the page's shell: its slots take the brand, the navigation, the content and more.",
      ],
    ),
    h2("Hide the elements until they are ready"),
    p(
      "Until the components load, a browser draws what is inside them as plain content. Hide the ones that would show the wrong thing:",
    ),
    sample(
      "css",
      `
idg-button:not(.hydrated) {
  visibility: hidden;
}

idg-dialog:not(.hydrated),
idg-toast-region:not(.hydrated) {
  display: none;
}
`,
      "site.css",
    ),
    note(
      "In a stylesheet, not inline",
      "The components run under a content security policy that refuses inline styles, so this rule belongs in a file of your own origin.",
    ),
    h2("Let visitors choose"),
    p(
      "Add the switcher anywhere in the page. With ",
      code("persist"),
      ", a choice is stored, and the bootstrap script puts it back before the first paint of the next visit.",
    ),
    sample(
      "html",
      `<idg-variation-switcher heading="Appearance" persist></idg-variation-switcher>`,
    ),
    h2("Where to next"),
    bullets(
      [
        link("/docs/theming/", "The theming guide"),
        ": every axis and token, and a theme of your own",
      ],
      [
        link("/docs/security/", "The security notes"),
        ": the policy the components need, and what your server must do",
      ],
      [
        "The variations guides for ",
        link(repository("docs/variations/react.md"), "React"),
        ", ",
        link(repository("docs/variations/vue.md"), "Vue"),
        " and ",
        link(repository("docs/variations/angular.md"), "Angular"),
        ", with server rendering",
      ],
    ),
  ],
});
