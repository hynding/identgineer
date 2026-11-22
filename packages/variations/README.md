# @identgineer/variations

An optional runtime for the four variation axes (`theme`, `design`, `layout`, `ux`) and the colour
scheme. The attributes are the real interface: everything here is sugar on top of them, and a page
that never loads this package still works.

Adoption guides, each self-contained and using only what exists today (framework wrappers are a
later feature): [plain HTML](../../docs/variations/plain-html.md),
[React](../../docs/variations/react.md), [Vue](../../docs/variations/vue.md) and
[Angular](../../docs/variations/angular.md). A test holds every import in them to the package's real
exports. The ready-made control panel is `<idg-variation-switcher>` of
[`@identgineer/components`](../components/README.md#idg-variation-switcher).

## Use the attributes alone (no JavaScript)

Set the attributes on the root element. Each axis defaults when its attribute is absent, and
`data-scheme` follows the system preference when it is absent.

```html
<html data-theme="ember" data-design="glass" data-layout="bento" data-ux="focus" data-scheme="dark">
  …
</html>
```

| Attribute     | Values                                                                | Default       |
| ------------- | --------------------------------------------------------------------- | ------------- |
| `data-theme`  | `THEME_IDS` of `@identgineer/tokens`, or a registered generated theme | `aurora`      |
| `data-design` | `DESIGN_IDS`                                                          | `flat`        |
| `data-layout` | `LAYOUT_IDS`                                                          | `top-bar`     |
| `data-ux`     | `UX_MODE_IDS`                                                         | `comfortable` |
| `data-scheme` | `light`, `dark`; absent means follow the system                       | system        |

See [`@identgineer/tokens`](../tokens/README.md) for what each value looks like.

## API

```ts
import {
  applyVariations,
  getVariations,
  onVariationsChange,
  REGISTRY,
  resetVariations,
  shuffleVariations,
} from "@identgineer/variations";
```

Every function that touches the DOM takes an optional `root` (an element or a `Document`), so tests
and multiple documents work. Without one it uses the global document, looked up when called, never
when imported. A `Document` that is given but has no root element is treated as having no root: it
never falls back to the global document. Reading it gives the defaults, and `applyVariations` and
`resetVariations` change nothing and report the state they would have produced.

```ts
getVariations();
// { theme: "aurora", design: "flat", layout: "top-bar", ux: "comfortable", scheme: "system" }

const { state, rejected, changed } = applyVariations({ theme: "ember", scheme: "dark" });
// Only the axes you pass change. Defaults are written explicitly, so a later change of a
// stylesheet default cannot alter a user's choice. scheme "system" removes data-scheme.
// Invalid values are left out and listed in `rejected`; it never throws.
// `changed` is relative to the state before this call. The result, `state`, `changed` and `rejected` are frozen.

const stop = onVariationsChange(({ state, changed }) => console.log(changed, state));
stop();

resetVariations(); // removes every attribute: the stylesheet defaults apply again

applyVariations(shuffleVariations()); // random state that differs from the current one
shuffleVariations(() => 0.5); // inject the random source for deterministic tests
```

- **Registry.** `REGISTRY.theme`, `.design`, `.layout` and `.ux` hold `attribute`, `defaultId` and
  `variations: { id, label, description, preview }[]`, built from the token registries so they cannot
  drift. A theme's `preview` is `{ kind: "theme", swatches, fonts }` (swatches for both schemes); the
  others only have `{ kind: "text", label, description }`, which is all the tokens expose. All of it
  is plain data a UI can draw without inline styles. `REGISTRY.scheme` lists `light`, `dark`, `system`.
- **Parsing.** `parseVariations(input)` keeps the valid axes; `validateVariations(input)` also
  returns `rejected`; `isVariationId(axis, value)` is the single check everything uses.
- **Change notification.** `onVariationsChange` also hears changes made by markup or other scripts
  (a `MutationObserver` on the five attributes, only while someone listens). One change gives one
  notification, measured against what listeners were last told, so a change made by markup just
  before a call is announced with it, not lost. A listener that itself applies a change does not
  reorder anything: nested announcements wait until the current one has reached every listener and
  the event, so all of them see the states in order and end on the final one. A listener that is
  unsubscribed during a dispatch is not called afterwards. What listeners receive is frozen. One
  dispatch delivers at most 100 announcements: if listeners keep undoing each other, the rest are
  dropped with a `console.error` and the next change is measured against the DOM. The same change
  is dispatched on the root as a bubbling `idg-variations-change` `CustomEvent` with
  `detail: { state, changed }`. Listeners are given what this package computed, not the event's
  `detail`, because any script can dispatch a forged event; treat the event's
  `detail` as a hint if you listen to it directly.

## Generated themes

Themes generated from a brand kit by [`@identgineer/brand`](../brand/README.md) are extra
`data-theme` values. The theme check refuses any id it does not know, so register a generated
theme's id before applying it:

```ts
import { applyVariations, isVariationId, registerThemeIds } from "@identgineer/variations";

const { registered, rejected, unregister } = registerThemeIds(["acme"]);
const theme = "acme";
if (isVariationId("theme", theme)) applyVariations({ theme });
unregister(); // later, if the theme goes away: an id another registration holds stays
```

- Only the theme axis changes, and only for ids that pass the added theme id rule of
  `@identgineer/tokens` (`ADDED_THEME_ID_RULE`, the same rule brand ids follow): two to 32
  lower-case letters and digits in words joined by single hyphens, starting with a letter, and not
  in `RESERVED_THEME_IDS` (every built-in id of every axis, CSS-wide keywords, `default`, `none`,
  `auto`, `system`, `light`, `dark`, `brand`, `theme`, `custom`, `constructor`, `prototype`). The
  rule is embedded in the generated registry data, so the browser entry still imports no package.
  Anything else is returned in `rejected`, unchanged; it never throws and never loosens the check
  for other values.
- A registered id is accepted everywhere the check is used: `applyVariations`, `getVariations`
  reading the attribute back, `decodeVariations` and `loadVariations`. Unregistered again, an id
  left on the page reads as the default.
- `REGISTRY`, its previews and `shuffleVariations` keep to the built-in themes: a generated theme
  has no entry there.
- The bootstrap script embeds the built-in ids when it is built and does not know registered ones,
  so a stored or linked generated theme is applied once the page's script registers it, not
  before first paint. Render `data-theme` on the server to avoid that flash.
- `VariationState["theme"]` is `ThemeId | RegisteredThemeId`. `RegisteredThemeId` is a branded
  string: only `isVariationId` and `registerThemeIds` produce one.

## Persistence

Off unless you ask. `applyVariations(partial, { persist: true })` merges the valid choice into
`localStorage` under `idg:variations:v1` as JSON. Or call `saveVariations(state)`,
`loadVariations()` and `clearStoredVariations()` yourself; each takes an optional storage object.

`loadVariations()` validates every field, ignores unknown keys and malformed JSON, refuses values
over 1 KB, and returns only the fields that were valid. No storage function throws: private mode,
blocked storage and quota errors come back as `false` or an empty object.
`resetVariations({ persist: true })` also clears the stored choice.

## Sharing a choice in a URL

Parameters are prefixed (`idg-`) so they cannot collide with a site's own.

```ts
encodeVariations({
  theme: "aurora",
  design: "glass",
  layout: "bento",
  ux: "focus",
  scheme: "dark",
});
// "idg-theme=aurora&idg-design=glass&idg-layout=bento&idg-ux=focus&idg-scheme=dark"
encodeVariations({ theme: "aurora", design: "glass" }, { omitDefaults: true });
// "idg-design=glass": `omitDefaults` is off by default, for the reason below

decodeVariations("?idg-design=glass&page=2"); // { design: "glass" }, validated like everything else

variationsUrl(
  { theme: "ember", design: "flat", layout: "top-bar", ux: "comfortable", scheme: "dark" },
  "https://example.com/docs?page=2#intro",
);
// "https://example.com/docs?page=2&idg-theme=ember&idg-design=flat&idg-layout=top-bar
//   &idg-ux=comfortable&idg-scheme=dark#intro" (one line in reality)
```

`variationsUrl` always says all five choices, defaults and `scheme=system` included. A default left
out would mean "whatever the recipient already chose", so a recipient with their own stored choices
would not see what the sender saw. It replaces only the five exact parameter names (also when
percent-encoded) and keeps everything else in the base URL, including look-alikes such as
`idg-campaign`, byte for byte.

`decodeVariations` accepts `location.search`, a `URLSearchParams` or a whole URL (a string is read
from its first `?` up to its first `#`), and `variationsUrl` takes the URL to share. Nothing reads or
writes `location` for you: pass `location.search` or `location.href` yourself.

## Bootstrap script: no flash of the wrong variation

The attributes must be set before first paint. `dist/bootstrap.js` is a tiny classic script (under
2 KB, no dependencies, no module syntax) that reads the URL first, then storage, checks each value
against the allowlists embedded at build time, and sets the attributes. It never throws and never
writes storage or announces events; it only sets attributes.

```html
<head>
  <script src="/variations/bootstrap.js" integrity="sha384-…"></script>
  <link rel="stylesheet" href="…tokens css…" />
</head>
```

- Put it in `<head>`, before the stylesheet, and without `async` or `defer` so it blocks paint.
- Copy `@identgineer/variations/bootstrap.js` to your own origin. `bootstrap.sri.json` holds
  `{ file, integrity, bytes }`. Both files exist only after the package is built
  (`pnpm --filter @identgineer/variations build`).
- In code (Node, for the site build or docs) get the tag attributes with
  `bootstrapScriptAttributes("/variations/bootstrap.js")` from
  `@identgineer/variations/bootstrap-tag`, which returns `{ src, integrity }`. `src` must be a
  same-origin path: it starts with a single `/`, with no `//`, backslash, scheme or control
  character, otherwise it throws. The script is meant to run under `script-src 'self'`, so it is
  served from your own origin and needs no `crossorigin` attribute.
- The integrity is computed from this package's source, not read from `dist`. The file you serve
  must be the one built from the same version of the package. To be sure, read
  `dist/bootstrap.sri.json` at deploy time instead.
- The build is deterministic: the same registry gives the same bytes, so the hash only changes when
  a variation id, the storage key or the parameter prefix does. Rebuild and update the tag then.

### CSP

The script is external and has no inline code, so a strict policy needs only the same origin:

```
script-src 'self'
```

Add `require-trusted-types-for 'script'` freely: it uses no `eval`, `Function`, `innerHTML` or
string-based timers. The integrity attribute means a tampered file is not run.

## Security model

- Everything that can come from outside (the URL, storage, existing attributes, arguments) is
  untrusted and is accepted only on an exact string match with a registry id (or a theme id
  registered with `registerThemeIds`, which takes only short slugs). There is no trimming,
  case folding or coercion, so wrong case, whitespace, non-strings, `__proto__` and `constructor`
  and long input are all rejected. What reaches an attribute is always one of the registry's own
  strings.
- Attributes are written with `setAttribute` from that allowlist only. No `innerHTML`, `eval` or
  inline script or style is used anywhere.
- Reading attributes back (`getVariations`) applies the same check, so markup with an unknown value
  reads as the default.
- Storage and URL values are read, never trusted: a hostile stored value loses to the allowlist.

## Server-side rendering

Importing the package touches no DOM, `window`, `document` or storage. Without a document the
functions return defaults (`getVariations`), apply nothing (`applyVariations` still validates and
returns the state it would have produced), and `onVariationsChange` returns a no-op unsubscribe.
Render the attributes into the HTML on the server and let the bootstrap script apply a visitor's
stored choice before paint. Pass a `root` explicitly to work with a particular document.

## Bundle size

The browser entry imports only the checked-in `src/generated/registry-data.ts`, never
`@identgineer/tokens` (a dev dependency) or any `node:` module. Bundled and minified it is about
15 KB (5 KB gzipped); a test walks the import graph and holds the bundle to a size budget.
After changing the token registries, run `pnpm --filter @identgineer/variations generate`; a test
fails if the generated file differs from what the tokens produce.

## Build

`pnpm --filter @identgineer/variations build` writes `dist/bootstrap.js` and
`dist/bootstrap.sri.json`, and fails if the script reaches 2 KB.
