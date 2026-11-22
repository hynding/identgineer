# Variations in plain HTML

The four axes and the colour scheme are attributes on the root element. A page needs no JavaScript
to use them. Everything after the first section is optional.

## 1. Attributes only

Load the tokens stylesheet and set the attributes you want. An axis whose attribute is absent
takes its default, and without `data-scheme` the theme follows the system preference.

```html
<!doctype html>
<html
  lang="en"
  data-theme="ember"
  data-design="glass"
  data-layout="bento"
  data-ux="focus"
  data-scheme="dark"
>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My page</title>
    <link rel="stylesheet" href="/tokens/index.css" />
  </head>
  <body>
    …
  </body>
</html>
```

| Attribute     | Values                                                                                          | Default       |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------- |
| `data-theme`  | `aurora`, `ember`, `tidal`, `graphite`, `citrus`, `orchid`, `terminal`, `paper`                 | `aurora`      |
| `data-design` | `flat`, `soft`, `glass`, `brutalist`, `outline`, `elevated`, `pixel`, `editorial`               | `flat`        |
| `data-layout` | `top-bar`, `side-rail`, `split-hero`, `magazine`, `dashboard`, `centered`, `bento`, `immersive` | `top-bar`     |
| `data-ux`     | `comfortable`, `compact`, `spacious`, `playful`, `calm`, `focus`, `guided`, `power`             | `comfortable` |
| `data-scheme` | `light`, `dark`; absent means follow the system                                                 | system        |

`/tokens/index.css` is `@identgineer/tokens`'s `dist/index.css`, copied to your own origin. Putting
the attributes in the markup is also what a server should do when it knows the visitor's choice.

## 2. Remember a visitor's choice without a flash: the bootstrap script

`@identgineer/variations` builds a tiny classic script that reads the URL, then storage, checks
every value against the allowlist and sets the attributes before the page is painted. Copy
`dist/bootstrap.js` and `dist/bootstrap.sri.json` of the built package to your origin (for example
`/variations/bootstrap.js`) and put the tag first in the head, blocking:

```html
<head>
  <meta charset="utf-8" />
  <script src="/variations/bootstrap.js" integrity="sha384-COPY-FROM-bootstrap.sri.json"></script>
  <link rel="stylesheet" href="/tokens/index.css" />
</head>
```

- No `async`, no `defer`, no `type="module"`: it must block paint.
- The `integrity` value is the `integrity` field of `bootstrap.sri.json`. From a Node build script,
  `bootstrapScriptAttributes` gives the same `src` and `integrity` (see the React guide for a
  server-side example).
- The script is external and has no inline code, so a strict policy needs only
  `script-src 'self'` (and works with `require-trusted-types-for 'script'`).
- It only reads. It stores nothing: a choice is stored by the switcher below, or by
  `applyVariations(…, { persist: true })`.

## 3. Add the switcher

`<idg-variation-switcher>` is a custom element of `@identgineer/components`. Load the components'
lazy loader (`dist/identgineer/identgineer.esm.js` of the built package, served here as
`/build/identgineer.esm.js`) and use the element anywhere in the page:

```html
<script type="module" src="/build/identgineer.esm.js"></script>

<idg-variation-switcher heading="Appearance" persist></idg-variation-switcher>
<idg-variation-switcher axes="theme,scheme" orientation="inline"></idg-variation-switcher>
```

| Attribute     | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `persist`     | save each change, so the bootstrap script can restore it on the next visit |
| `axes`        | comma separated subset of `theme`, `design`, `layout`, `ux`, `scheme`      |
| `orientation` | `stacked` (default) or `inline`                                            |
| `heading`     | visible heading that also names the panel                                  |

React to a change with the DOM event the element fires:

```html
<script type="module" src="/page.js"></script>
```

```js
// /page.js
document
  .querySelector("idg-variation-switcher")
  .addEventListener("idgVariationsChange", (event) => {
    console.log(event.detail.changed, event.detail.state);
  });
```

The switcher always acts on the document's root element and stays in sync with any other change of
the attributes. "Copy link" produces a URL that the bootstrap script of the recipient's page
applies before first paint (`?idg-theme=ember&idg-design=glass&…`).

## 4. A page script, without the switcher

The runtime needs no component. `@identgineer/variations` is TypeScript source consumed by a
bundler, so import it from your own bundled script:

```js
import { applyVariations, onVariationsChange } from "@identgineer/variations";

applyVariations({ theme: "tidal", scheme: "dark" }, { persist: true });
const stop = onVariationsChange(({ state, changed }) => console.log(changed, state));
```
