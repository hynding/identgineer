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

## Icons and links

### `idg-icon`

| Prop    | Attribute | Values                                     | Default |
| ------- | --------- | ------------------------------------------ | ------- |
| `name`  | `name`    | one of the names below                     |         |
| `size`  | `size`    | `sm` (1em), `md` (1.25em), `lg`, `xl`      | `md`    |
| `label` | `label`   | accessible name; without it the icon hides |         |

Thirty-seven icons are drawn by the library for its own use: `chevron-up`, `chevron-down`,
`chevron-left`, `chevron-right`, `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right`, `check`,
`close`, `plus`, `minus`, `search`, `eye`, `eye-off`, `info`, `warning`, `error`, `success`, `user`,
`settings`, `menu`, `external-link`, `copy`, `trash`, `edit`, `calendar`, `clock`, `lock`, `mail`,
`bell`, `home`, `chart`, `shield`, `sparkles`, `sun`, `moon`.

- The paths are original data in `src/components/icon/icon-paths.ts`, on a 24px grid, stroked with
  `currentcolor` and rendered as JSX `<svg>` and `<path>`. There is no `innerHTML` and no sprite to
  fetch, so the icons work under the strict CSP.
- With a `label` the svg is `role="img"` with that name. Without one it is `aria-hidden`, which is
  right for an icon beside text that says the same thing.
- An unknown or missing `name` renders nothing, and warns once per name in a development build.
- Part: `icon`. The form controls use it for the password reveal, the invalid mark and the select
  chevron.

### `idg-link`

| Prop            | Attribute        | Notes                                                                   | Default         |
| --------------- | ---------------- | ----------------------------------------------------------------------- | --------------- |
| `href`          | `href`           | http, https, mailto, tel or relative url                                |                 |
| `target`        | `target`         | any browsing context name                                               |                 |
| `rel`           | `rel`            | link relationships                                                      |                 |
| `external`      | `external`       | shows the external indicator and opens a new tab unless `target` is set | `false`         |
| `externalLabel` | `external-label` | accessible name of the indicator                                        | `External link` |

An inline link: the default slot is its text. It takes the button's link hardening. The url goes
through `safeUrl`, so a `javascript:` or `data:` url (or none) renders an inert link with no `href`,
`role="link"` and `aria-disabled="true"`, and a `target` other than `_self` always adds `rel="noopener
noreferrer"`. It is always underlined, so colour is not the only thing that sets it apart from text.
Hover uses the accent-subtle pair, focus uses the design's focus ring, and a visited link is mixed
toward the text colour. Part: `control`.

## Surfaces

Colour never carries meaning alone in these components: every status has a text label, an icon or a
shape as well.

### `idg-card`

| Prop            | Attribute       | Values                                     | Default |
| --------------- | --------------- | ------------------------------------------ | ------- |
| `variant`       | `variant`       | `plain`, `raised`, `outlined`, `accent`    | `plain` |
| `padding`       | `padding`       | `none`, `sm`, `md`, `lg`                   | `md`    |
| `interactive`   | `interactive`   | boolean                                    | `false` |
| `heading`       | `heading`       | the card's title                           |         |
| `headingLevel`  | `heading-level` | 1 to 6                                     | `3`     |
| `href`          | `href`          | makes the heading a link (needs `heading`) |         |
| `target`, `rel` |                 | as for `idg-link`                          |         |

- **Slots:** `media` (full-bleed, at the top), `header` (beside the heading, such as a badge),
  default (the body) and `footer`. A region with nothing in it is not drawn, so it takes no padding.
  **Parts:** `card`, `media`, `header`, `heading`, `body`, `footer`.
- **The card is where a design language shows.** The surface fill and backdrop blur, the surface
  border, the radius and the elevation are all taken as the design gives them: frosted glass over
  whatever is behind it, a thick black border and hard offset shadow (brutalist), top and bottom
  rules and an underlined heading (editorial), a double border and stepped shadow (pixel), paired
  light and dark shadows (soft), layered shadows (elevated). The heading takes the design's heading
  transform and decoration, and the rule above the footer is the design's own border.
- **Variants.** `plain` uses the first elevation and `raised` the second. `outlined` drops the fill
  and shadow and draws a strong 2px edge of its own, which a borderless design would otherwise lack.
  `accent` is the theme's accent colour; the tokens its contents read are re-pointed inside it (text,
  muted text, links, and surfaces such as a secondary button) so that content stays legible in
  designs whose surfaces are transparent. Use the `secondary` button there, not the primary one,
  which is the same colour as the card.
- **Interactive.** The card lifts on hover by `--idg-feedback-hover-lift` and moves a hard-shadow
  design by a share of its offset, both scaled by `--idg-motion-enabled`, and takes the next
  elevation. A card with a link is always interactive.
- **One link.** With `href` and a `heading`, the heading is the card's only link. Its anchor has a
  pseudo-element stretched over the card, so a click anywhere follows it while assistive technology
  finds one link, named by the heading. Keyboard focus rings the whole card. Without a `heading`
  there is no link text, so `href` is ignored. The url and `rel` get the same hardening as
  `idg-link`. Content in the footer slot sits above the stretched link and stays clickable, but its
  empty space still follows the card's link. Put other links and buttons in the footer, not the
  body.

### `idg-badge`

`variant` (`neutral`, `accent`, `success`, `warning`, `danger`, `info`; default `neutral`), `size`
(`sm`, `md`) and `dot` (a leading dot in the text colour). The label is the default slot. Each
variant is the theme's subtle background with its on-subtle text, which the token build keeps at
4.5:1 in every theme and scheme (and the browser tests recompute it). Parts: `badge`, `dot`, `label`.

### `idg-avatar` and `idg-avatar-group`

| Prop          | Attribute      | Notes                                                                   | Default |
| ------------- | -------------- | ----------------------------------------------------------------------- | ------- |
| `src`         | `src`          | picture; http, https or relative only                                   |         |
| `alt`         | `alt`          | what the picture shows; defaults to `name`; `""` marks it as decoration |         |
| `name`        | `name`         | source of the initials, the colour and the default alt                  |         |
| `size`        | `size`         | `xs`, `sm`, `md`, `lg`, `xl`                                            | `md`    |
| `status`      | `status`       | `online`, `away`, `busy`, `offline`                                     |         |
| `statusLabel` | `status-label` | accessible name of the status; defaults to the status in English        |         |

- The picture is `loading="lazy"`, `decoding="async"` and `referrerpolicy="no-referrer"`. Its url
  goes through `safeImageUrl`: `data:`, `blob:`, `javascript:`, `mailto:` and the rest are never
  loaded. When the url is refused, missing or the image fails to load, the avatar shows the initials
  (the first letter of the first and last word of `name`) or, with no name, a person icon. A new `src`
  after a failure is tried again.
- The colour is one of six theme pairs chosen by hashing the name, so a person is the same colour
  everywhere, with no stored state and no inline style. Names are compared trimmed and
  case-insensitively.
- Accessible name: the image's `alt`, or for initials a `role="img"` with the same name. An
  avatar with nothing to say (no alt and no name, or `alt=""`) is `aria-hidden`.
- The status dot is a named image and each status has a shape of its own: a solid dot, a dot with a
  bite out of it, a dot with a bar, an empty ring.
- `idg-avatar-group` overlaps its `idg-avatar` children. `size` is applied to them, `label` makes the
  row a named group, and `max` hides the avatars past it (it sets `hidden` on them) and draws a
  `+N` count named "N more" (`more-label` changes the word). Parts: `group`, `more`.
- Avatar parts: `avatar`, `image`, `status`.

### `idg-alert`

| Prop           | Attribute       | Values                                 | Default   |
| -------------- | --------------- | -------------------------------------- | --------- |
| `variant`      | `variant`       | `info`, `success`, `warning`, `danger` | `info`    |
| `dismissible`  | `dismissible`   | boolean                                | `false`   |
| `dismissLabel` | `dismiss-label` | the dismiss button's name              | `Dismiss` |

- **Slots:** `title` and the default slot (the message). **Parts:** `alert`, `icon`, `title`, `body`,
  `dismiss`. Each variant has its own icon.
- **Announcement.** `warning` and `danger` are `role="alert"` (assertive); `info` and `success` are
  `role="status"` (polite). The role carries the live behaviour, and no `aria-live` is added beside
  it, which would announce a message twice. A live region announces what is inserted, not what was
  on the page already, so render an alert at the moment it applies.
- **Dismiss** is a real button. It emits `idgDismiss`, a cancelable event, and the alert then
  hides itself (sets `hidden`) unless a listener calls `preventDefault()`.
- The alert is a surface of the design language (surface border, radius and first elevation) filled
  with the variant's opaque subtle colour, so the text pair keeps its contrast whatever is behind
  it.

### `idg-progress`

`label`, `value`, `max` (default 100), `indeterminate`, `show-value` and `size` (`sm`, `md`, `lg`).
The bar is a native `<progress>`, so the browser reports its role, value and maximum, and the label
is its accessible name; always set one. Without a `value`, or with `indeterminate`, it is
indeterminate and exposes no value. A value is kept inside `0..max` and a maximum that is not
positive means 100. `show-value` draws the percentage, hidden from assistive technology since the
element already reports it. An indeterminate bar runs a band across the track scaled by
`--idg-motion-enabled`; where movement is off, or under `prefers-reduced-motion`, the band stands
still and pulses instead. Parts: `label`, `value`, `control`.

### `idg-skeleton`

`variant` (`text`, `rect`, `circle`) and `lines` (1 to 10 lines of text, the last shorter). A skeleton
is always `aria-hidden`, so it announces nothing. Pair it with a busy region: put `aria-busy="true"`
on the container and a text status such as a visually hidden `<p role="status">Loading profile</p>`
in it, then remove `aria-busy` and the skeletons when the content arrives. Size it with your own
CSS on the element (`idg-skeleton { inline-size: 12rem }`); there is no inline style. The shimmer
is a highlight mixed in by `--idg-motion-enabled`, so where movement is off the shape is one flat
colour and the animation is turned off. Part: `shape`.

### `idg-stat`

`label`, `value`, `delta` (text such as `12.4%`), `direction` (`up`, `down`, `flat`; default `flat`)
and `sentiment` (`positive`, `negative`, `neutral`). The label and value are plain text; the change
is a pill with an arrow or minus icon. Direction is what the figure did and sentiment whether that is
good, so a rising churn rate is `direction="up" sentiment="negative"`; sentiment defaults from the
direction. The visible change is hidden from assistive technology and replaced by spoken text such as
"Increased by 12.4%"; `up-label`, `down-label` and `flat-label` change the words. Slot `chart`
holds something like a sparkline beside the figures. Parts: `label`, `value`, `delta`. Labels sit
on the surface's normal text colour, so use `idg-stat` on `plain`, `raised` or `outlined` cards.

### `idg-divider`

`orientation` (`horizontal`, `vertical`) and `decorative`. It is a native `<hr>`; `decorative`
gives it `role="presentation"`. The rule is the design's own border (thick in brutalist, double in
pixel, a hairline in editorial) over a theme-coloured hairline that stands in where a design draws no
border (soft, elevated), and it is never thinner than 1px. A vertical divider needs a parent with a
height. Part: `line`.

## Strict CSP and Trusted Types

Every component is verified in Chromium against
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
  validation, keyboard, label click, browser-computed accessible names and descriptions, the
  accessibility tree beneath a card (one link), boundary contrast, text contrast of badges, alerts,
  avatars and changes in all 8 themes in light and dark, and axe (wcag2a, wcag2aa, wcag21aa, wcag22aa) across the 8 designs in light and dark and
  the 8 UX modes, on pages in `src/fixtures/` (`button.html`, `forms.html`, `surfaces.html`; copied to `www/fixtures/`; static HTML, no inline
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
