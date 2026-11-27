# @identgineer/site

The Identgineer website: a Stencil app, prerendered to static HTML, built only from the project's
own components, tokens and variation runtime. Every page re-skins live across the four variation
axes and reads, without JavaScript, as plain HTML.

```sh
pnpm --filter @identgineer/site build         # www/: the pages, assets and _headers.json
pnpm --filter @identgineer/site dev           # build, then serve www at http://127.0.0.1:4174
pnpm --filter @identgineer/site test:browser  # the browser suite (needs the build)
```

`dev` builds once and serves the result with the headers the build wrote. The pages are
prerendered, so a change is seen after the next `dev` (or `build`). `IDG_SITE_PORT` changes the port.

## Settings

| Variable       | Meaning                                                                                                                            | Default                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `IDG_SITE_URL` | The site's public address, the root of an origin (`https://identgineer.dev`). Canonical links and Open Graph URLs are built on it. | `https://identgineer.example/` |

The default is on a reserved domain, so a build that forgot the setting never points at anyone's
site. An address with a path, a query, a fragment or credentials is refused: every link of the site is
root-relative, so it can only be served at the root.

## Pages

`src/routes.ts` is the one place a page is declared: its path, its label in the navigation, its
title, its description and the Stencil component that draws it. The prerenderer, the navigation, the
home page's links and the build check all read it. A route marked `coming` is a page a later task
adds: the home page lists it as coming soon, without a link, and it is left out of the navigation
until it is `live`. Each live route is written to `<path>index.html`, and links between pages are
ordinary links with full page loads.

An address the site does not have gets `404.html`, which the server sends with status 404. It has no
canonical link and asks not to be indexed.

## How it is built

1. **`stencil build --prod`** compiles the site's components together with the component library.
   The site imports `@identgineer/components`, whose package names its Stencil collection, so the
   library's components are compiled into this app and prerendered and hydrated with the site's own.
   The workspace packages are TypeScript source; `stencil.config.ts` transpiles their files as the
   components package does. Two outputs are written: `www/build`, the client build the pages load,
   and `hydrate/`, the server build that renders them. The `www` copy step adds the tokens
   stylesheet, the variation bootstrap script, the site stylesheet and the icon under `www/assets`.
   The library's built types are not there before its build, and CI lints and type-checks first, so
   `tsconfig.json` maps `@identgineer/components` to its source, whose `src/components.d.ts` is
   committed. `tsconfig.build.json` drops the mapping, so Stencil reads the built collection. Both
   `src/components.d.ts` files are written again by every build, and CI fails if that changes them.
2. **`scripts/prerender.ts`** renders every page with the hydrate build's `renderToString`. The
   document it starts from (`scripts/document.ts`) puts the variation bootstrap script first in the
   head, blocking and checked by its integrity, then the stylesheets as plain links, so a stored or
   URL-given choice is on the root before the first paint. Shadow roots are written as declarative
   shadow DOM: a page is drawn and styled by the HTML parser alone. Stencil's prerender document
   lacks three things the components reach for while they connect (`adoptedStyleSheets`,
   `MutationObserver` and native `validity`); `scripts/server-document.ts` gives each the answer a
   browser gives before anything has happened.
3. The prerenderer then writes **`www/_headers.json`**: the content security policy and the other
   security headers, which a deployment must send with every response.

Stencil's own prerender (`www` with `prerenderConfig`) was not used: it inlines component styles and
loader scripts into each page, which the policy would have to allow or the build would have to
strip, and it adds module preloads the site does not need.

### Without JavaScript

Every page reads and navigates as plain HTML: the shell's landmarks, skip link and every component's
look come from declarative shadow DOM and the stylesheets. A menu button would need a script, so
without one `idg-layout` draws none and shows the navigation in the bar; the footer lists the pages
as well. The appearance panel is the one thing that needs a script: under `@media (scripting: none)`
its buttons are not drawn and the footer says so.

With scripting on but the client build failed to load, the appearance buttons, Surprise me and the
menu button are drawn and do nothing. They are not held back until the build has run: that would
draw them late on every page, a change in the first screen at each load, to cover a failure the
page cannot detect before the build either arrives or does not. The
panel's dialog and switcher are drawn in the browser only, so the prerendered page never shows the
default choices before the switcher has read the visitor's.

### Hydration

The client build takes over the prerendered page as it is: the browser suite compares the first
screen before and after hydration in each layout. Nothing the page looks like is decided by a
script, so nothing moves when the client build arrives.

## The policy

The build writes the policy the pages need; nothing else may be loaded:

```text
default-src 'none'; script-src 'self'; style-src 'self' 'sha256-…' …; img-src 'self';
base-uri 'none'; form-action 'self'; frame-ancestors 'none';
require-trusted-types-for 'script'; trusted-types 'none'
```

- **Scripts** are the bootstrap script and the client build, both files of the site's own origin.
  No page holds an inline script.
- **Styles** are the two stylesheets and the components' styles inside their declarative shadow
  roots, each allowed by its SHA-256 hash. The hashes are taken from the pages as written, so a
  change to a component's style changes the policy at the next build. No element has a `style`
  attribute, and nothing writes one: the client build adopts constructed stylesheets.
- **Trusted Types** are required and no policy may be created: neither the components nor the
  bootstrap script write HTML from a string.
- **Nothing from another origin**, fonts included: the themes use system fonts.

With the policy, `_headers.json` holds `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
`Permissions-Policy`, `Referrer-Policy`, `X-Content-Type-Options` and `X-Frame-Options`. The browser
tests serve the site with exactly these headers (`scripts/static-server.ts`, also used by `dev`).

## Tests

- **Unit** (`pnpm test`): the route table, the site address, the metadata, the document, the policy
  and the prerender document.
- **The built site** (`checks/built-site.test.ts`, in `pnpm test` once the site is built): every
  route has a file, every internal link, fragment and asset resolves, no page holds an inline script,
  a `style` or event handler attribute, or an inline style the policy does not name, and nothing
  points at another origin.
- **Browser** (`pnpm --filter @identgineer/site test:browser`, a CI job of its own): every page in
  each of the eight layouts at 390, 820 and 1440px passes axe, does not scroll sideways and opens the
  appearance panel; every page in each theme and design, in both schemes, and in each UX mode passes
  axe; the panel changes all four axes and the scheme, and the choice survives navigation and reload
  already on the root before the body exists; hydration changes nothing in the first screen; the
  headers are the ones the build wrote; and every page reads and navigates with JavaScript off. Any
  console error, policy violation or request to another origin fails a test.

The layout tests pass with the fonts of a machine with Inter and with DejaVu Sans, the wider face a
CI runner falls back to. To check the latter on a machine with Inter, point `FONTCONFIG_FILE` at a
fontconfig file that rejects it.
