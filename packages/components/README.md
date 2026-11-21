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

## Form controls

`idg-field`, `idg-input`, `idg-textarea`, `idg-select`, `idg-checkbox`, `idg-radio`,
`idg-radio-group` and `idg-switch`. Each wraps a native element inside its shadow root and is
form-associated through `ElementInternals`, so it takes part in `FormData`, `form.reset()`,
`form.checkValidity()`, `fieldset disabled` and the browser's restore-on-back, with no hidden input
and no script in the page.

Shared behaviour:

- **Value and validity.** The host reports its value with `setFormValue` and mirrors the native
  element's `ValidityState` and message into `setValidity`, anchored on the native element so
  `reportValidity()` focuses it. The rules (`required`, `minlength`, `maxlength`, `pattern`, `min`,
  `max`, `step`, `type`) and the messages are therefore the browser's own. The form value is also
  updated inside the input and change handlers, so a submit in the same frame sees it.
- **Reset** restores the value or state the element had when first connected. `fieldset disabled`
  and `disabled` both disable the inner element. A saved value is restored through
  `formStateRestoreCallback`.
- **Methods.** `setFocus()`, `checkValidity()`, `reportValidity()` (each returns a promise, as Stencil
  methods do).
- **Events.** `idgInput` (every edit) and `idgChange` (a committed value) carry a typed detail:
  `{ value }` for input, textarea, select and radio group, `{ checked, value }` for checkbox and
  switch (types `ValueDetail` and `CheckedDetail`). Native `focus` and `blur` reach the host. A
  native `input` event is composed and also reaches the host; the native `change` event is not,
  which is why `idgChange` exists.
- **Boundary.** The control border tokens draw the edge. Designs with none (`soft`, `elevated`)
  would leave no visible boundary, so a 1px inset ring in `--idg-color-border-strong` is always
  drawn. Where `@container style()` exists it is withdrawn for designs that have their own border,
  and elsewhere the two simply add up. Tested at 3:1 or better against the surface in `soft` and
  `elevated`, light and dark.
- **Invalid** uses the danger tokens, a heavier edge and a "!" mark. **Readonly** has a subtle fill
  and a dashed edge; **disabled** adds fading and a blocked cursor. Target size comes from
  `--idg-density-target-size`. In `forced-colors` the drawn marks switch to system colours.

### The field protocol

An id reference (`aria-labelledby`, `aria-describedby`, `for`) cannot cross a shadow boundary, and
the label in `idg-field` and the native input in `idg-input` are in different roots. Cross-root
element reflection (`ariaLabelledByElements`) is not available in every browser. So the field passes
plain text down and the control applies it inside its own root:

| Property (set by the field)    | Applied by the control as                                                         |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `accessibleLabel`              | `aria-label` on the native element                                                |
| `accessibleDescription`        | a visually hidden element in the control's root, pointed at by `aria-describedby` |
| `invalid`                      | `aria-invalid`, the danger styling and the "!" mark                               |
| `required` (when the field is) | the native `required`, so validity and the `required` state follow                |

`idg-input`, `idg-textarea`, `idg-select` and `idg-radio-group` implement it (`idg-checkbox` and
`idg-switch` take the same three properties; their name comes from their slotted text). Any element
with an `accessibleLabel` property inside a field gets it. A native `<input>` inside a field is not
supported.

Verified in Chromium through the DevTools accessibility tree (`browser/accessible-node.ts`), not
inferred from attributes. For example the email input is a `textbox` named "Email" with description
"We never share it", and an invalid username has description "Letters only That name is taken" and
`invalid: true`.

### `idg-field`

| Prop           | Attribute       | Notes                                                    |
| -------------- | --------------- | -------------------------------------------------------- |
| `label`        | `label`         | Visible label and the control's accessible name          |
| `hint`         | `hint`          | Help text                                                |
| `error`        | `error`         | Error message. Marks the control invalid                 |
| `required`     | `required`      | Star beside the label, and `required` on the control     |
| `optionalText` | `optional-text` | Text such as "optional" for a field that is not required |

- **Slots:** default (the one control), `label`, `hint`, `error` (rich content in place of the
  props; their text is what is handed to the control).
- **Label click** focuses the control (`setFocus()`, which for a radio group is its tab stop).
- **Hints** are shown when `--idg-ux-hints` is `1` (the `guided` mode). It is done with `calc()` on
  the number (`max-block-size` and `opacity`), so it needs no style query. The hint is only
  collapsed, and the same text is in the control's accessible description in every mode.
- **Error** is one `role="alert"` region, present before any error exists so that inserting the
  message is what is announced, with no `aria-live` beside it that would announce twice. The error
  is also part of the control's description, for a user who arrives at it later.

### `idg-input`

| Prop                                                                        | Notes                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `type`                                                                      | `text`, `email`, `password`, `search`, `tel`, `url`, `number`; others fall back to `text` |
| `name`, `value`, `placeholder`, `required`, `disabled`, `readonly`          |                                                                                           |
| `minlength`, `maxlength`, `min`, `max`, `step`, `pattern`                   | Native constraints                                                                        |
| `autocomplete`, `inputmode`, `enterkeyhint`, `spellcheck`, `autocapitalize` | Passed to the native input                                                                |
| `size`                                                                      | `sm`, `md` (default), `lg`                                                                |
| `reveal`, `revealLabel`                                                     | Password reveal button; label default "Show password"                                     |

Slots `start` and `end` sit inside the box. The reveal control is a real `<button type="button">`
with `aria-pressed`; it changes only the native input's `type`, never the value.

**Autofill and password managers.** Everything a password manager reads is on the native input:
`type`, `name`, `autocomplete` (use `username` and `current-password` or `new-password`) and
`inputmode`. Whether a manager finds it is outside this library, and shadow DOM is a real limit:

- Chromium: public status says autofill inside shadow DOM was shipped (Chrome's "Intent to Ship:
  Autofill in ShadowDOM"). Third-party managers have to walk open shadow roots; Dashlane has
  written about doing so.
- Safari: WebKit bug 279595 reports Password AutoFill not offered for a form-associated custom
  element with shadow DOM.
- Firefox: inputs in shadow roots have long been outside its form detection (open bugs). Treat
  autofill there as unsupported.
- The native input is not owned by the page's `<form>` (a form owner is found within one tree), so
  heuristics that group fields by form see a formless input.

None of this was verified here: no password manager or autofill UI runs in the headless test
browser. For a sign-in page where a working manager matters most, use native `<input>` elements, or
test the managers you support. Shadow roots are open, which the managers that do work depend on.

### `idg-textarea`

Props `name`, `value`, `placeholder`, `rows` (default 3), `required`, `disabled`, `readonly`,
`minlength`, `maxlength`, `autocomplete`, `spellcheck`, `autocapitalize`, `size`.

- `autogrow` grows with the content. `field-sizing: content` is used where it exists; a hidden twin
  holding the same text sets the height elsewhere (and gives the minimum `rows` everywhere), with no
  script writing styles.
- `counter` shows `n / maxlength` (or `n`). The visible count is hidden from assistive technology;
  a separate polite status speaks only within 20 characters of the limit, at the limit, and past it.

### `idg-select`

Options are written as children, as for a native select (`option` and `optgroup`), and copied into
the shadow `<select>` by DOM calls (`createElement`, `setAttribute`, `textContent`), never as markup,
and re-copied on `slotchange` and when an option's text, value, label, disabled or selected state
changes. A typed `options` prop was the alternative; children were chosen because the markup is the
same as native HTML, works in plain HTML and in any framework, and needs no data serialised into an
attribute. Anything that is not an option or optgroup is ignored. The trigger is styled and the popup
is the browser's native one. A placeholder is an `<option value="">`.

### `idg-checkbox` and `idg-switch`

Props `name`, `value` (submitted while on, default `on`), `checked`, `required`, `disabled`,
`invalid`. `idg-checkbox` also has `indeterminate`, shown as a bar and exposed to assistive
technology as mixed; a user choice clears it, and submission follows `checked` alone, as natively.
`idg-switch` is a native checkbox given `role="switch"`; its thumb moves by its inline offset, so
right-to-left needs no rule, and where `--idg-motion-enabled` is `0` it jumps and only colour fades.
The label is the default slot and the whole row is the click and tap target. Event `idgChange`.

### `idg-radio-group` and `idg-radio`

The group is the form-associated element: `name`, `value`, `required`, `disabled`,
`orientation` (`vertical` or `horizontal`), `invalid`. Radios in separate shadow roots are not a
native radio group, so the group does what the native group would:

- one tab stop (the checked radio, or the first enabled one), set on the radios as `tabbable`;
- `ArrowDown` and `ArrowRight` move to the next enabled radio and choose it, `ArrowUp` and
  `ArrowLeft` to the previous, wrapping (the horizontal arrows swap in right-to-left text), as in the
  WAI-ARIA radio group pattern;
- each radio is told its `position` and `setSize` (`aria-posinset` and `aria-setsize`), which separate
  roots cannot work out for themselves.

`idg-radio` has `value` and `disabled` and the label as its slot. `checked`, `groupDisabled`,
`tabbable`, `position`, `setSize` and `invalid` are set by the group; use `idg-radio` inside a group
only. A required group with no choice is invalid with "Please select one of these options.",
anchored on the first radio. `idg-radio-group` emits `idgChange` `{ value }`; the radio's own
`idgSelect` is stopped at the group.

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
pnpm --filter @identgineer/components build
pnpm --filter @identgineer/components test:browser   # real-browser tests against www
```

- Specs (`*.spec.tsx`) run in Stencil's mock DOM through `@stencil/vitest`, compiling components
  on the fly. Mock DOM has no form association and ignores event capture, so the form paths stub
  the form that element internals report. Browser behaviour belongs to the end-to-end suite.
- **Browser tests** (`browser/*.browser.ts`, Playwright with `@axe-core/playwright`) are not part of
  `pnpm test`. They run against the built `www` output, served by a small static server that sends
  `Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'`
  on every response, and fail any test on a console error, warning or page error, so each one is also
  a CSP and Trusted Types test. They cover hydration, real form submission and reset, constraint
  validation, keyboard, label click, browser-computed accessible names and descriptions, boundary
  contrast, and axe (wcag2a, wcag2aa, wcag21aa, wcag22aa) across the 8 designs in light and dark and
  the 8 UX modes, on pages in `src/fixtures/` (copied to `www/fixtures/`; static HTML, no inline
  script or style). Build first. Playwright's own Chromium is installed with
  `pnpm --filter @identgineer/components exec playwright install --with-deps chromium`; where that is
  not possible, set `IDG_CHROMIUM_PATH` to a Chromium binary (`/opt/pw-browsers/chromium` is used if it
  exists). `IDG_BROWSER_PORT` changes the port (4173). Only Chromium is run.
- `src/testing/` holds spec helpers (a recording `ElementInternals`, since the mock DOM has none) and
  is excluded from the Stencil build.
- `tsconfig.json` is the strict config for tooling and editors. `tsconfig.build.json` is the one
  Stencil reads: it turns on emit and turns off `verbatimModuleSyntax`, which Stencil's decorator
  transform cannot work with. `exactOptionalPropertyTypes` is off in both because Stencil's JSX
  attribute types do not accept an explicit `undefined`.
- `src/components.d.ts` is generated by Stencil and committed.
