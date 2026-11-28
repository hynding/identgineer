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

| Variable       | Meaning                                                                                                                                    | Default                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `IDG_SITE_URL` | The site's public address, the root of an origin (`https://identgineer.dev`). Canonical links, Open Graph URLs and the sitemap use it.     | `https://identgineer.example/` |
| `IDG_CMS_URL`  | The CMS's address (`https://cms.example.com`, or `http://localhost:1337`), read at build time for the reading pages and navigation labels. | unset: the repository's pages  |

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
canonical link and asks not to be indexed. The build writes `sitemap.xml`, every live route by its
canonical address (not the 404 page, nor a page whose SEO asks for `noIndex`), and `robots.txt`, which
names it.

### Reading pages

Features, Identity, Tracking and the docs (the index, Getting started, the theming guide and the
security notes) are reading pages: one component, `site-content-page`, draws each from a content page
in `src/content/pages/`, written from the packages' READMEs and the guides in `docs/`. A route names
its page by `content: "<slug>"`; a docs guide names the docs index as its `parent`, which gives the
docs their own section navigation, marked with `aria-current`, and links to the page before and after.

A content page (`src/content/content-page.ts`) is data, never HTML: a slug, a title, a summary, SEO
fields (`metaTitle`, `metaDescription`, `noIndex`) and a body of blocks:

| Block       | What it holds                                                                            |
| ----------- | ---------------------------------------------------------------------------------------- |
| `heading`   | Level 2, 3 or 4, as text. The first is level 2 and none skips a level.                   |
| `paragraph` | Runs of text, each strong, emphasised or code, and links.                                |
| `list`      | Bulleted or numbered items, each runs of text and links.                                 |
| `code`      | A sample in one of `html`, `css`, `ts`, `js`, `json`, `sh` or `text`, with a caption.    |
| `callout`   | A note or a warning, with a title, holding runs of text and links.                       |
| `table`     | A caption, up to six column headings and rows of cells of runs.                          |
| `example`   | A live example by name: `sign-in`, `dashboard-figures` or `theme-tiles`, with a caption. |

`parseContentPage` (`src/content/validate-content-page.ts`) gives a valid page or an error that says
which block, which field and which rule (the build names the page itself): an unknown key or block, an unknown example or
language, a heading that skips a level or repeats an id, a control or direction-changing character,
or a length past its bound (`CONTENT_LIMITS`, including the body's text as a whole). A link is a live
path of the route table, the `#id` of a heading of the same page, or an `https:` address without
credentials; anything else (`javascript:`, `data:`, `//host`, `http:`) is refused. The prerenderer
passes the page to the component as JSON, and the component checks it again before it draws
anything; every piece becomes an element or text, never markup. An external link gets
`rel="noopener noreferrer"`. A code sample is plain text with a copy button that is drawn only with
scripting, and no highlighter.

### The CMS

With `IDG_CMS_URL` set, the build reads the CMS's public REST API (`scripts/cms-content.ts`):
`GET api/pages?status=published&populate[seo]=true` and `GET api/navigation-items`, as Strapi 5 and
strapi-php both answer them (`{ data: [records], meta: { pagination } }`). Each Page record's
`body` is the CMS's rich text (a `blocks` field), made into a body (`scripts/strapi-blocks.ts`):
paragraphs, headings, lists and code as they are, a quote as a note; an image is refused, since the
site loads nothing from another origin, and tables and examples cannot come from the CMS. The record
is then checked by the same validator as the repository's pages and, if valid, replaces the static
page of the same slug. A navigation item may give a page of the navigation another label in the bar
or the footer; it can never add a link.

What can go wrong never fails the build: a record that is invalid, a draft (no `publishedAt`), a slug
the site has no route for, or a page missing from the answer leaves the static copy, and the build
prints a warning that names it and why. Any error at all, in one record, in one collection or in the
whole read, falls back the same way (`scripts/cms-content.test.ts` reaches each fallback, and feeds
it deep, random and wide answers). The build prints at most 50 warnings about single records and
navigation items, and a line counting the rest, so no answer can flood its log; after them it always
prints what it fell back to: a line for each page not drawn from the CMS (one line for every page
when `IDG_CMS_URL` is refused or the pages could not be read at all), a line for pages or navigation items past the four pages of
records it reads, and one if the navigation could not be read. A warning names a record by its slug only when it is a valid one, and otherwise
by its position; it quotes CMS text short with anything outside printable ASCII escaped, and never
prints `IDG_CMS_URL`. What an editor may write, and what the site makes of it, is in
[cms/README.md](../../cms/README.md#what-an-editor-may-write). The read is bounded: `https:` only (or `http:` on
`localhost`, `127.0.0.1` or `[::1]`), no credentials, query or fragment in the address, no
credentials sent, no redirect followed, one 10 s deadline for all of it, 1 MiB per answer (by
`Content-Length` and as read), `application/json` only, a status of 200 only, and 4 answers of 25
records per collection (an answer of more than 25 is refused whole). With the setting unset no request is made.

### One page, eight arrangements

The home page is one set of markup: each section is a head, a body and a visual. `src/styles/site.css`
arranges them by the layout, with container style queries on `--idg-layout-shell` (which
`data-layout` sets) and size queries on the content's own width, all in tokens:

| Layout       | How the content is arranged                                                                   |
| ------------ | --------------------------------------------------------------------------------------------- |
| `top-bar`    | A product page: the sections zigzag; on a phone each example sits on a tinted panel.          |
| `side-rail`  | A reference manual: sections ruled off, each heading marked by an accent rule, in view.       |
| `split-hero` | Numbered steps, one under another, large numbers, in the half beside the pinned hero.         |
| `magazine`   | An issue: a lead story, two stories side by side with a rule between, a boxed feature.        |
| `dashboard`  | Panels with tinted title bars: sign-in and figures side by side, the rest across the grid.    |
| `centered`   | One narrow column with centred headings.                                                      |
| `bento`      | Tiles on one grid: wide tiles, text beside example, and the sign-in and figures side by side. |
| `immersive`  | Full-width bands, alternately tinted, with large centred headings.                            |

The "On this page" aside stays in view where it is beside the content, and is not drawn where a
layout would put it after the content (`centered`, `side-rail` and `split-hero`). Sections side by
side come out about as tall as each other in the default look (`browser/balance.browser.ts`; other
designs and UX modes are not measured), and the pages to come, the theme tiles and the axes are grids
of equal columns with every row full (`browser/grids.browser.ts`), the overview card, with what the
features cover, spanning two columns or the row.

What holds where: at 320 to 1440px, with text at the browser's own size, in every design, layout
and UX mode, with Inter or a wider fallback face, no word, figure or the site's name is broken inside
itself, nothing runs under anything else or out of its box, and the page does not scroll sideways.
The cards and figures are never narrower than their content needs in the current face and type
size, and the site's name is no larger than the room idg-layout's brand has beside the menu button.
That holds in Chromium; in an engine without `calc-size()`, as Safari is, where the cards and
figures fall back to `min-content` and idg-stat and idg-button to their own fallbacks; and in one
without `calc-size()` or container style queries, as Firefox is. `browser/fit.browser.ts` checks
all three. With text enlarged past the browser's own size, the page at 320px can scroll sideways by
a few pixels at 125% and by more at 150% and 200% in some combinations; with text at 200% in a
phone's window a word wider than its column breaks rather than leave it, and in an engine without
`calc-size()` a figure keeps its width there and may reach past a narrow card.

A browser without container style queries (Firefox) applies none of the eight arrangements, idg-layout's or
the site's: whatever the layout, it gets the shell's own arrangement (the bar, then the hero, the
content and the "On this page" list one under another, at the content's measure), with the menu
button beside a brand that is the container of its room, and the site's base rules in it, the
sections zigzagging from 40rem of content and stacked below that. The tokens a layout sets (gaps,
measure) and the design and UX mode still apply. The base rules are written for that shell, and
the style queries only add to them; `browser/fit.browser.ts` takes every style query out of a page
and checks the whole sweep again.

## How it is built

1. **`stencil build --prod`** compiles the site's components together with the component library.
   The site imports `@identgineer/components`, whose package names its Stencil collection, so the
   library's components are compiled into this app and prerendered and hydrated with the site's own.
   The workspace packages are TypeScript source; `stencil.config.ts` transpiles their files with
   the components package's own plugin (`@identgineer/components/stencil-workspace-sources`). Two outputs are written: `www/build`, the client build the pages load,
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
   security headers, which a deployment must send with every response. It also removes what
   Stencil's `www` output writes that no page loads (its dev server's `host.config.json`, the loader
   for browsers without modules and an empty entry); the built-site check fails on any file in
   `www` that no page needs.

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
base-uri 'none'; form-action 'none'; frame-ancestors 'none';
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
- **No form posts anywhere** (`form-action 'none'`): the sign-in form on the home page is an inert
  preview. A page with a form that posts will name its target here.

With the policy, `_headers.json` holds `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
`Permissions-Policy`, `Referrer-Policy`, `X-Content-Type-Options` and `X-Frame-Options`. The browser
tests serve the site with exactly these headers (`scripts/static-server.ts`, also used by `dev`).
`_headers.json` is a build product for the deployment, which turns it into its own header rules; it
need not be served itself.

## Tests

- **Unit** (`pnpm test`): the route table, the site address, the metadata, the document, the policy,
  the prerender document, the static server, the sitemap and robots.txt, the content validator
  (hostile and malformed input: `javascript:`, `data:` and protocol-relative links, unknown blocks
  and examples, heading jumps, control and direction characters, oversized bodies), the navigation
  items, the CMS's rich text, the CMS read against a fake CMS (success, an invalid record, 404, 5xx,
  a timeout, a body that stalls, an oversized answer, a wrong content type, a redirect to another
  origin, drafts, the page count, what an editor may write, and answers that must never fail the
  build: links and values nested thousands deep, 150 seeded random and adversarial answers, a
  failure in each of its fallbacks, answers of more records than asked for; at most 50 warnings
  about records and items, then every fallback whatever came before, each short printable ASCII, never holding the setting), every reading page
  in the repository, and the browser suite's parts.
- **Rendering** (`checks/content-render.test.ts`, once the site is built): a page with every block,
  drawn by the hydrate build as the prerenderer draws it: one h1, the sections and their headings,
  each block's elements, outbound links' `rel`, both tables of contents, the docs' navigation and
  pager, markup in the content only ever as text, places to wrap only in long names, no id used twice
  in one tree (a heading named as a table's caption included), a refused page, and the navigation's
  labels on every page component.
- **The built site** (`checks/built-site.test.ts`, in `pnpm test` once the site is built, and
  required on CI): every live route has a file and is in the sitemap, which robots.txt names, every
  internal link, fragment and asset resolves, no page uses an id twice in one tree, an outbound link is an `https:` link with
  `noopener noreferrer` and nothing is loaded from another origin, the
  bootstrap script comes first, blocking and with the integrity of the file served, no page holds an
  inline script, a `style` or event handler attribute, or an inline style the policy does not name,
  and `www` holds nothing that no page needs.
- **Browser** (`pnpm --filter @identgineer/site test:browser`, a CI job of its own): every page in
  each of the eight layouts at 390, 820 and 1440px passes axe, does not scroll sideways and opens the
  appearance panel; every page in each theme and design, in both schemes, and in each UX mode passes
  axe; the panel changes all four axes and the scheme, and the choice survives navigation and reload
  already on the root before the body exists; hydration changes nothing in the first screen or 700px
  down; the current page is marked and the first Tab reaches the skip link; the headers are the ones
  the build wrote; every page in every layout reads and navigates with JavaScript off, with its
  links in the bar and no menu button; the docs' own navigation marks the guide shown, the pager
  links its neighbours and a code sample's copy button copies it; the home page, the identity page
  (the longest reading page) and the theming guide (the docs page with the widest content: tables
  and code) fit every design with every layout and every UX mode (the theme and the scheme turning
  with them) at 320, 390, 820 and 1440px, as Chromium draws it, without `calc-size()` and without
  `calc-size()` or container style queries; every other page, the 404 page included, fits each
  design once, each with a different layout (eight pairs, shifted from page to page) in every UX
  mode, in all three engines; a reading page and a docs page filled with the longest unbroken text
  the validator takes in every field (labels, title, summary, headings, captions, cells, code, links)
  fit every layout in all three engines at 320 to 1440px; fitting is no sideways scroll, nothing cut or spilling out of its box
  (a code sample or table that scrolls sideways and takes focus, or a bar of links that scrolls to each as it takes focus, may hold what it scrolls), no word,
  figure or name broken inside itself and no two controls over each other; in the default look, in
  bento, dashboard and magazine at 768 to 1440px no section beside another is more than a fifth
  empty below its content, in every layout at 390 to 2560px every row of the pages to come, the
  theme tiles and the axes is full and the theme tiles of a row are laid out alike, and the
  overview spans two of four columns in the dashboard at 1920px and the side rail at 2560px; and
  in every design the rules side-rail and magazine draw are there, 2 to 8px, and in every layout a
  section reached by a link stops short of the window's top; a reading page shows one table of
  contents, beside the article or before it, in every layout from 390 to 1440px; immersive centres
  each band's heading on its text's column on every reading page at 820 to 1920px and starts the
  content one gap under the hero; a docs page in top-bar, magazine, dashboard and bento puts its pages in a row over the article where the aside stands beside it, from 72rem (1152, 1440 and 1920px), and in a column beside the article just below (1151px); a table or code sample that scrolls shades the edge it has more
  beyond, in every layout; and a short name in code never wraps. Any console error, policy violation or request to
  another origin fails a test.

CI runs the browser suite in seven parts (`browser/parts.ts`): each engine's fit sweep in two (the
home and identity pages, then the rest), chosen by a tag on each test, and every other test in the
last. `pnpm --filter @identgineer/site test:browser:part <part>` runs one, and
`test:browser:parts` checks that the parts hold every test exactly once, which CI does on every run.
On two workers each fit part takes about four to five minutes and the last about seven.

`IDG_CPU_THROTTLE=6` runs the hydration tests with the page's CPU six times slower, as a slow CI
runner is; add `--repeat-each=3` to repeat them.

The layout tests pass with the fonts of a machine with Inter and with DejaVu Sans, the wider face a
CI runner falls back to. To check the latter on a machine with Inter, point `FONTCONFIG_FILE` at a
fontconfig file that rejects it.
