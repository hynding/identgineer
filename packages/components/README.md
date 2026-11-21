# @identgineer/components

Stencil web components, namespace `identgineer`, tag prefix `idg-`. Every colour, size, radius,
border, shadow and duration comes from an `--idg-*` token of
[`@identgineer/tokens`](../tokens/README.md), so the components follow the theme, design language
and UX mode set on the page and never carry a style of their own.

## Install and load

Load the tokens CSS globally and set the axis attributes on `<html>`. Custom properties inherit
through shadow DOM, so nothing else is needed.

```html
<html lang="en" data-theme="aurora" data-design="flat" data-ux="comfortable">
  <link rel="stylesheet" href="/tokens/index.css" />
  <link rel="stylesheet" href="/app.css" />
  <script type="module" src="/build/identgineer.esm.js"></script>
  <idg-button>Save</idg-button>
</html>
```

Two builds are produced by `pnpm --filter @identgineer/components build`:

- **Lazy loader** (`dist/identgineer/identgineer.esm.js`, or `import { defineCustomElements } from "@identgineer/components/loader"`). Components load on first use.
- **Custom elements** (`@identgineer/components/custom-elements`). Tree-shakeable, needs a bundler
  to resolve `@stencil/core`.

`dist/docs.json` describes every component (props, slots, parts) for the sandbox. Framework
wrappers are a later feature.

To avoid a flash of unstyled content without an injected `<style>`, hide the elements yourself:

```css
idg-button:not(.hydrated) {
  visibility: hidden;
}
```

## `idg-button`

| Prop        | Attribute    | Values                                    | Default   |
| ----------- | ------------ | ----------------------------------------- | --------- |
| `variant`   | `variant`    | `primary`, `secondary`, `ghost`, `danger` | `primary` |
| `size`      | `size`       | `sm`, `md`, `lg`                          | `md`      |
| `type`      | `type`       | `button`, `submit`, `reset`               | `button`  |
| `disabled`  | `disabled`   | boolean                                   | `false`   |
| `loading`   | `loading`    | boolean                                   | `false`   |
| `href`      | `href`       | http, https, mailto, tel or relative url  |           |
| `target`    | `target`     | any browsing context name                 |           |
| `rel`       | `rel`        | link relationships                        |           |
| `fullWidth` | `full-width` | boolean                                   | `false`   |
| `shortcut`  | `shortcut`   | a hint such as `Enter`                    |           |

Unknown `variant`, `size` and `type` values fall back to the defaults.

- **Slots:** default (label), `start`, `end`. The `start` slot is replaced by the spinner while loading.
- **Parts:** `control` (the native `<button>` or `<a>`), `label`, `spinner`.
- **Events:** the native `click` only. It is not delivered while `disabled` or `loading`.
- **Form:** form-associated. `type="submit"` calls `form.requestSubmit()` and `type="reset"` calls
  `form.reset()` on the owning form. A disabled or loading button does nothing. Veto a submission on
  the form's `submit` event, not on the button's `click`.
- **Loading:** sets `aria-busy="true"` and `aria-disabled="true"` and keeps the control focusable.
  The spinner rotates only where `--idg-motion-enabled` is `1` and `prefers-reduced-motion` is not
  set, otherwise it pulses or stays still.
- **Link mode:** with `href` the control is an `<a>`. The url goes through `safeUrl`; anything else
  (`javascript:`, `data:`, control-character tricks, leading whitespace) is dropped and the control
  renders as an unavailable link with no `href`. A `target` other than `_self` always adds
  `rel="noopener noreferrer"`. A disabled or loading link also loses its `href`.
- **Shortcut:** the hint is shown only when `--idg-ux-shortcuts` is `1` (the `power` mode), through a
  CSS style query, with no script. It is a hint only: nothing binds the key. `aria-keyshortcuts`
  is always set.

Designs without control borders (`soft`, `elevated`) get a hairline around the secondary variant
through a style query; in `forced-colors` the preferences layer restores a system-colour border.

## Strict CSP and Trusted Types

Verified in Chromium against
`default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'`
with the lazy build loaded from an external script: components define and hydrate and styles apply,
with no console violation.

- Stencil applies component styles as constructable stylesheets (`adoptedStyleSheets`), which
  `style-src` does not govern. In a browser without them it injects a `<style>` instead; give it a
  nonce with `<meta name="csp-nonce" content="...">` or `setNonce()`. That fallback is not tested.
- `invisiblePrehydration: false` (set in `stencil.config.ts`) stops the loader injecting an inline
  `<style>` that hides components until they hydrate; with it on, `style-src 'self'` blocks that
  style.
- `stencil build` inlines scripts and styles into `www/index.html`, so that page is for local
  development. `www/csp-demo.html` is copied untouched and is the page to load under a CSP.
- The custom-elements build was not loaded under the CSP: it needs a bundler, and runs the same
  runtime.

Component sources are scanned by `checks/` for `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`document.write`, `eval`, `new Function`, string event handlers and inline style strings, and the
stylesheets for hex, `rgb()`, `hsl()` and similar colour literals and raw `ms` or `s` durations.

## Development

```sh
pnpm --filter @identgineer/components build      # dist, loader, dist/docs.json and www (needs the tokens build)
pnpm --filter @identgineer/components dev        # watch and serve www
pnpm test                                        # unit tests, checks and Stencil specs, from the repo root
```

- Specs (`*.spec.tsx`) run in Stencil's mock DOM through `@stencil/vitest`, compiling components
  on the fly. Mock DOM has no form association and ignores event capture, so the form paths stub
  the form that element internals report. Browser behaviour belongs to the end-to-end suite.
- `tsconfig.json` is the strict config for tooling and editors. `tsconfig.build.json` is the one
  Stencil reads: it turns on emit and turns off `verbatimModuleSyntax`, which Stencil's decorator
  transform cannot work with. `exactOptionalPropertyTypes` is off in both because Stencil's JSX
  attribute types do not accept an explicit `undefined`.
- `src/components.d.ts` is generated by Stencil and committed.
