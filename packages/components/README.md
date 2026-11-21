# @identgineer/components

Stencil web components, namespace `identgineer`, tag prefix `idg-`. Every colour, size, radius,
border, shadow and duration comes from an `--idg-*` token of
[`@identgineer/tokens`](../tokens/README.md), so the components follow the theme, design language,
layout and UX mode set on the page and never carry a style of their own.

## Install and load

Load the tokens CSS globally and set the axis attributes on `<html>`. Custom properties inherit
through shadow DOM, so nothing else is needed.

```html
<html lang="en" data-theme="aurora" data-design="flat" data-layout="top-bar" data-ux="comfortable">
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

/* Content that only shows once opened. */
idg-dialog:not(.hydrated),
idg-toast-region:not(.hydrated) {
  display: none;
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
- **Overlay trigger:** `accessibleExpanded`, `accessibleHaspopup`, `accessibleControls` and
  `accessibleDescription` are set by an overlay and applied to the inner control (see
  [Overlays](#overlays)). The description is a visually hidden element outside the control.
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
- **Load order.** The field hands its label, hint and error to its control whichever is defined
  first: a control whose element is defined after the field picks them up when it is.
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

## Overlays

`idg-dialog`, `idg-popover`, `idg-tooltip`, `idg-menu` (with `idg-menu-item`, `idg-menu-group` and
`idg-menu-separator`), `idg-toast` and `idg-toast-region`. Each is built on a platform feature
rather than a script that imitates one: the native `<dialog>` for dialogs, the Popover API (top
layer, light dismiss, Escape) for the rest, and CSS anchor positioning to place a surface against its
trigger. Surfaces take the design language's border, radius and elevation over the page colour, so a
transparent design stays readable and glass stays frosted; they fade in, and slide only by
`--idg-motion-enabled`. In `forced-colors` every surface has a 2px `CanvasText` border.

- **Right to left.** Every overlay uses logical properties where a side depends on the direction. A
  `-start` or `-end` placement follows the overlay's direction, from `dir` on the page or any
  ancestor: `bottom-start` lines up with the trigger's right edge in right-to-left text. `left` and
  `right` stay physical sides. The script fallback reads the trigger's computed direction.
- **Removed while open.** A dialog, popover or menu taken out of the page while open closes as if
  by its method: it emits `idgClose`, its trigger is no longer marked expanded, and it opens
  normally when put back. Focus is left where the move put it. A toast region shows its toasts
  again when put back. An `open` attribute in the page's markup shows a popover or menu without
  taking focus.

### Triggers across shadow roots

An overlay tells its trigger it is expanded and what it controls. The trigger may be an `idg-button`
or a native button, in the overlay's `trigger` slot or elsewhere in the same root by `for`:

| Trigger      | Expanded state, popup and controls                               | Description (tooltip)                    |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------- |
| `idg-button` | `accessibleExpanded`, `accessibleHaspopup`, `accessibleControls` | `accessibleDescription` (field protocol) |
| native       | `ariaExpanded`, `ariaHasPopup`, `ariaControlsElements`           | `ariaDescription`                        |

`idg-button` applies them to its inner `<button>`: `aria-expanded` and `aria-haspopup`, and
`ariaControlsElements` pointing out of its root at the surface. Element reflection may point from a
shadow root into an ancestor root, not into a sibling's, so `aria-controls` by id could never work
here. All of it is set through DOM properties; no id is built from content, and every id lookup is
`getElementById` in the overlay's own root.

**Verified in Chromium through the DevTools accessibility tree** (`browser/accessible-node.ts`):

- the `idg-button` trigger of a popover or menu is a `button` with `expanded: false`, then `true`,
  `hasPopup: "menu"` for a menu, and a `controls` relation with one related node;
- a tooltip on an `idg-button` gives its inner button the description "Copies the link to the
  clipboard", and on a native button "Opens in a new tab" (through `aria-description`), whether or
  not the hint is showing;
- a dialog is a `dialog` named by its heading ("Invite teammates"); an `alert` dialog is an
  `alertdialog` named "Delete project?" and described by its slotted body text;
- a menu is a `menu` named by its trigger ("Actions", through `ariaLabelledByElements` into the
  ancestor root), and each `idg-menu-item`, though in a shadow root of its own, is a `menuitem`,
  `menuitemradio` or `menuitemcheckbox` with `checked: "true"`/`"false"` and `disabled: true`
  as set, inside a `group` named "Sort by" with `separator` nodes between sections;
- the toast region is a `region` named "Notifications" holding `group` nodes named by each toast's
  heading.

Two findings changed the markup. Chromium exposes an element with `popover` as an unnamed `group`,
which wrapped the menu in noise, so the menu's popover has `role="none"`. And a CSS
`text-transform: uppercase` reaches the computed name ("SORT BY"), so the group label is not
uppercased. `aria-describedby` at a host whose text sits in a hidden popover gave an empty
description, which is why tooltips use the description properties above.

### `idg-dialog`

| Prop              | Attribute           | Values                                    | Default |
| ----------------- | ------------------- | ----------------------------------------- | ------- |
| `open`            | `open`              | boolean; opens as `modal` says            | `false` |
| `modal`           | `modal`             | boolean                                   | `true`  |
| `heading`         | `heading`           | the title and accessible name             |         |
| `size`            | `size`              | `sm`, `md`, `lg`, `full`                  | `md`    |
| `dismissible`     | `dismissible`       | boolean; Escape and the close button      | `true`  |
| `closeOnBackdrop` | `close-on-backdrop` | boolean                                   | `false` |
| `alert`           | `alert`             | boolean; `alertdialog`, described by body | `false` |
| `closeLabel`      | `close-label`       | the close button's name                   | `Close` |

- **Methods:** `show()` (non-modal), `showModal()`, `close(returnValue?)`.
- **Events:** `idgOpen` (`{ modal }`), `idgClose` (`{ returnValue, reason }`, the reason one of
  `escape`, `backdrop`, `close-button`, `method`, `form`) and `idgCancel` (`{ reason }`), cancelable,
  before a user dismissal (`escape`, `backdrop`, `close-button`); `preventDefault()` keeps it open.
- **Slots:** default (the body, which scrolls), `header` (beside the heading, or the heading when
  `heading` is not set) and `footer`. **Parts:** `dialog`, `header`, `heading`, `body`, `footer`,
  `close`.
- **Modal.** `showModal()` puts the dialog in the top layer, makes the rest of the page inert and
  contains focus. The page behind does not scroll: a constructed stylesheet adopted by the document
  sets `overflow: hidden`, and `scrollbar-gutter: stable` only when there is a scrollbar, so the
  layout does not shift. It is reference-counted across nested dialogs.
- **Focus.** On open, focus goes to an `[autofocus]` element of the dialog's own content, else the
  first focusable element in the flat tree (through shadow roots and slots), else the dialog. On
  close it returns to the element that had it, even inside another shadow root. If that element is
  gone, it goes to the first focusable element of its nearest remaining ancestor. A non-modal dialog
  closed while focus is elsewhere leaves focus alone. For an `alert` dialog put `autofocus` on the
  least destructive action.
- **Escape** is the browser's close request, with `closedby="closerequest"`, or `"none"` when not
  `dismissible`, which ignores it. The browser's own `cancel` is turned into `idgCancel`, so a
  listener can refuse. Browsers close the dialog anyway on a second Escape with no other input in
  between, so a page cannot trap the user; `idgClose` then reports `escape`. **Backdrop**: a press
  and release both outside the dialog box.
- **`<form method="dialog">`** in slotted content closes the dialog with the submitter's `value`
  as `returnValue` and the reason `form`. A form inside a nested `idg-dialog` closes only that one.
- **Nested dialogs** stack in the top layer; Escape closes the top one. Closing a dialog closes the
  dialogs open inside it first, innermost first, each reporting the reason `method`, so none is left
  in the top layer once its parent is hidden.
- **Looks.** The scrim is the theme's text colour at low opacity, then varies by design through
  style queries: translucent and blurred for glass, a hatch for hard-shadow designs, a checker for
  pixel, a pale frosted veil where a design has no surface border, a paper wash for editorial. The
  dialog rises and scales in by the motion tokens.

### `idg-popover`

`placement` (`top`, `bottom`, `left`, `right`, each with `-start` or `-end`, or alone; default
`bottom-start`), `offset` (px, default 8), `open` and `for` (the id of a trigger in the same root, in
place of the `trigger` slot). Methods `show()`, `hide()`, `toggle()`; events `idgOpen`, `idgClose`.
Slots `trigger` and default; part `surface`.

- A click on the trigger toggles it. Escape and a click outside close it (light dismiss), and focus
  returns to the trigger when it was inside the popover or would otherwise be lost.
- On open, focus moves to an `[autofocus]` element in the content or to the surface itself; it is a
  disclosure, so focus is not contained and Tab moves on.
- **Positioning.** With a slotted trigger, CSS anchor positioning (`anchor-name` set through
  `::slotted`, `position-area`, `position-try-fallbacks: flip-block, flip-inline`) places it with no
  script. With `for`, or where anchor positioning is not supported, a small script measures the
  trigger and flips and shifts the surface into the viewport on scroll and resize.

### `idg-tooltip`

`text`, `placement` (default `top`), `offset` (default 8) and `for`; the default slot is the trigger.
Part `tooltip`.

- Shows after `--idg-feedback-hover-delay` (see the tokens; 250ms in `power`, 700ms in `calm`) for a
  mouse or pen, at once on keyboard focus (`:focus-visible`), and never for touch, so a long press
  does not cover the control. WCAG 1.4.13: it stays while the pointer moves onto it (a 120ms grace),
  stays until the pointer leaves or focus moves, and Escape hides it without closing anything else.
  It also hides on scroll. Reduced motion removes the fade's movement.
- Text only, set as text. It is the trigger's accessible description (see above); the drawn hint is
  `aria-hidden`, so it is not read twice. Put anything interactive in an `idg-popover`.
- A `popover="hint"`, so it does not close an open menu or popover; `manual` where `hint` is not
  supported.

### `idg-menu`

A menu button (WAI-ARIA APG). `placement` (default `bottom-start`), `offset` (default 4), `open` and
`label` (the menu's name; without it the trigger names the menu). Methods `show()`, `hide()`; events
`idgSelect` (`{ value, checked? }`), `idgOpen`, `idgClose`. Slots `trigger` and default; parts
`surface`, `menu`.

- **Keyboard.** Enter, Space or ArrowDown on the trigger opens at the first item, ArrowUp at the
  last. In the menu: arrows (wrapping), Home, End, typeahead (500ms), Enter and Space choose, Escape
  closes and returns to the trigger, Tab closes and moves on. Disabled items are reached but not
  chosen. Focus moves to the items themselves (roving `tabindex`), since `aria-activedescendant`
  cannot reach into their shadow roots.
- Choosing an item closes the menu and returns focus to the trigger, except Space on a checkable
  item, which toggles it and keeps the menu open.

`idg-menu-item`: `value`, `type` (`item`, `checkbox`, `radio`), `checked`, `disabled`, `href`,
`target`, `rel`, `shortcut` (a hint shown in the `power` mode, as `aria-keyshortcuts` always) and
`icon`. Methods `setFocus()`, `follow()`. With `href` it is a link with the role `menuitem`; the url
goes through `safeUrl` and `rel` through the same hardening as `idg-link`, and Enter follows it.
Radio items are exclusive within their `idg-menu-group`, or the menu. Parts `item`, `icon`, `check`,
`label`, `shortcut`.

`idg-menu-group`: `label`, drawn and naming the `group`. `idg-menu-separator`: a `separator`.

### `idg-toast` and `idg-toast-region`

```ts
import { toast } from "@identgineer/components";

const handle = toast({
  title: "Studio archived",
  description: "Projects are read-only until you restore it.",
  variant: "neutral", // "info" | "success" | "warning" | "danger"
  duration: 6000, // ms; 0 keeps it until dismissed
  action: { label: "Undo", onSelect: () => restore() },
});
handle.dismiss();
```

`toast()` accepts strings only and checks at run time: a title that is not a non-empty string, a
description that is not a string (an object with a `toString` included), an unknown variant, a
negative or `NaN` duration, or an action without a string label and a function throws a `TypeError`
and shows nothing. Every string is set as text. It adds the toast to the page's `idg-toast-region`,
creating one at the end of `<body>` when there is none.

`idg-toast`: `heading`, `description`, `variant`, `duration`, `actionLabel` (`action-label`),
`closeLabel` (default `Dismiss`); method `dismiss()`; events `idgAction` and `idgDismiss`
(`{ reason }`: `timeout`, `close-button`, `action`, `escape`, `swipe`, `api`), cancelable, after
which the toast removes itself. Parts `toast`, `icon`, `heading`, `description`, `action`, `close`.
`queued` and `paused` are set by the region.

`idg-toast-region`: `position` (`top-start`, `top-center`, `top-end`, `bottom-start`,
`bottom-center`, `bottom-end`, logical, so `start` is the right in right-to-left text; default
`bottom-end`), `max` (shown at once, default 3), `label`
(default `Notifications`) and `hotkey` (default `F8`). Part `region`.

- **Announcements.** The region has one polite live region, and an assertive one used only for
  `danger`. Each toast is announced as it comes into view (a queued one when its turn comes), as
  text, 100ms after the change so the live region is in place. Each toast's lines are added as
  paragraphs of their own to live regions that are not atomic, so a screen reader reads only what
  was added, and nothing is replaced, so no toast cuts another short. Each line is removed 5s after
  it was added, so browsing the page does not meet it twice and a steady stream does not pile up. A
  region moved in the page announces what was waiting and removes lines whose time ran out. Focus
  never moves on its own.
- **Reaching it.** The region is a landmark (`<section>` with a name) and `hotkey` focuses it while
  it holds a toast (`aria-keyshortcuts`). Tab then reaches the action and close buttons. Escape in a
  toast dismisses it; focus moves to the next toast, or back where it was before focus entered the
  region, whether by the hotkey, Tab or a click (the last focused element outside it when nothing
  had focus at that moment).
- **Timing.** Six seconds by default. A toast with an action never dismisses itself unless it is
  given a duration. Every toast stands still while the pointer is over the region, focus is inside
  it, the window is in the background, or the user prefers reduced motion (then toasts stay until
  dismissed), and runs on with the time it had left.
- **Queue.** At most `max` show at once, oldest first; the rest wait hidden and do not count down.
- **Swipe.** A sideways drag of 64px, or 35% of the width if more, with the primary button or
  pointer, dismisses a toast; a shorter one springs back. The distance is measured at the release,
  which is heard on the document, so a fast flick that ends off the toast counts. A swipe whose
  release never arrives ends at the next press, a context menu or the window losing focus. Vertical drags still scroll (`touch-action: pan-y`).
- **Top layer.** The region is a `popover="manual"`, shown while it holds a toast, so it is above
  other overlays, and lets clicks through around the toasts.

### Known limits

- **Toasts under a modal dialog** are inert while it is open, like everything outside it, and
  Chromium leaves them out of the accessibility tree, so they are neither announced nor reachable
  (they are drawn above the dialog when shown after it opened). Their countdowns still run. Announce
  from inside the dialog in that case.
- The first toast of a page is announced most reliably when the region is in the page from the start
  rather than created by the first `toast()` call.
- Without the Popover API, popovers, menus and tooltips do not open; there is no fallback. The toast
  region then stays in the page as a fixed box, outside the top layer. Without CSS anchor
  positioning the script positions surfaces instead.
- Everything above was verified only in Chromium (Chrome for Testing 153): anchor positioning,
  `popover="hint"`, `showPopover({ source })`, `closedby`, element reflection across shadow roots
  and `ariaDescription` were not checked in Firefox or Safari. Headless Chromium draws overlay
  scrollbars, so the scroll lock's gutter is unit-tested rather than measured.

## Navigation and data

### `idg-tabs`, `idg-tab` and `idg-tab-panel`

Tabs (WAI-ARIA APG). Write `idg-tab` and `idg-tab-panel` as children of `idg-tabs`; a tab and its
panel are paired by `value`, or by position when no `value` is given. The tabs host puts the `role`
and the selection state on the light-DOM `idg-tab` and `idg-tab-panel` elements themselves, so the
`aria-controls` and `aria-labelledby` relations use element reflection and no ids are needed.

`idg-tabs`: `value` (the selected tab; the first enabled one by default), `orientation`
(`horizontal`, `vertical`), `activation` (`automatic` selects on focus, `manual` on Enter or Space),
`label`. Event `idgChange` (`{ value }`); method `setFocus()`; parts `tablist`.
`idg-tab`: `value`, `disabled`. `idg-tab-panel`: `value`.

- **Values.** Keep them unique: a tab that repeats an earlier tab's value is paired with the same
  panel and can never be selected, and a warning naming the value is logged. When `value` names no
  tab, the enabled tab nearest to where the selection was takes over (the first, at load).

- **Keyboard.** Arrows move along the orientation (mirrored in right-to-left), Home and End jump,
  disabled tabs are skipped. Only the selected tab is in the tab order, and the panel takes
  `tabindex="0"` only when its content has nothing focusable.
- Removing or disabling the selected tab selects a neighbour; tabs and panels added later are
  picked up, and moving the whole component keeps the selection.

### `idg-accordion` and `idg-accordion-item`

Disclosure sections (APG accordion). Each item is a native button inside a heading, controlling its
panel through ids in one shadow root.

`idg-accordion`: `multiple` (several open at once; otherwise opening one closes the others),
`headingLevel` (`heading-level`, 1 to 6, default 3), `findInPage` (`find-in-page`, default on).
`idg-accordion-item`: `heading`, `value`, `open`, `disabled`. Event `idgToggle` (`{ value, open }`),
fired for every change of `open`; method `setFocus()`; slots default and `heading` (rich heading
content); parts `item`, `heading`, `trigger`, `title`, `chevron`, `panel`, `content`.

- **Keyboard.** Enter and Space toggle; ArrowUp, ArrowDown, Home and End move between enabled
  headers.
- Closed panels use `hidden="until-found"`, so browser find-in-page and fragment links open them
  (a disabled item is plainly hidden). With six items or fewer an open panel is a named `region`; a
  closed one is not, so a panel the browser can still find is not an empty landmark.
- **Single-open.** An item opened, or added already open, wins and the others close, each with one
  `idgToggle`. At first load the first item marked `open` wins, and the others close without an `idgToggle`, since nobody changed them. Nested accordions are independent:
  an item opening inside a panel does not close the item holding it.

### `idg-table`

Wraps a native `<table>` in the light DOM, so the table keeps its semantics. A constructable
stylesheet in the `idg.components` layer, built from the `--idg-*` tokens, is adopted into the
document or shadow root the table is in; no inline styles are used, so the strict CSP holds.

Props: `label`, `stickyHeader` (`sticky-header`), `striped`, `maxHeight` (`max-height`), `minWidth`
(`min-width`), `sortKey`, `sortDirection`, `manualSort`, `sortStatus` (the live-region text pattern, with `{column}` and `{direction}`), `sortAscendingLabel`
and `sortDescendingLabel` (the words for `{direction}`, default "ascending" and "descending"; set
them with `sortStatus` to translate the announcement).
Event `idgSort` (`{ key, direction }`); parts `scroller`, `status`.

- **Sorting.** Put `data-sortable` (its value is the key reported, else the column) on a `th` in the
  `thead`; it becomes a button, the header gets `aria-sort`, and the rows are reordered stably,
  numbers by value, empty cells last. A cell may give `data-sort-value`, which is what it sorts by;
  use it for anything the text does not order correctly, such as `1,200` (text sorts as a string
  unless it reads as a plain number) or dates written as words.
- **Spanning cells.** A table whose body has a cell with `rowspan` or `colspan` is not sortable: no
  sort buttons are drawn and `sortKey` does nothing, since moving its rows would break it. With
  `manual-sort` the table moves no rows, only reports `idgSort` and marks the column, so the buttons
  stay and the page may swap the body, for a loading row for instance. Focus on a button that is
  taken away goes to its header cell.
- **Nested tables.** A table nested in a cell, whether another `idg-table` or a plain `<table>`, is
  left to itself: the outer table sorts and watches only its own header and body rows.
- **Wide tables** scroll inside the component's own region, which is focusable and named by `label`
  or the caption, so the page never scrolls sideways.

### `idg-pagination`

Page navigation. Props: `page` (1-based, mutable), `pageCount`, `siblings` (default 1),
`boundaries` (default 1), `hrefTemplate` (`href-template`, with `{page}`), `label`, `previousLabel`,
`nextLabel`, `pageLabel`. Event `idgPageChange` (`{ page }`, cancelable); parts `nav`, `list`, `page`,
`previous`, `next`.

The list keeps a constant number of slots so it does not jump as the page changes. Without
`hrefTemplate` the controls are buttons; with it they are links, through `safeUrl`, and a template
that gives an unsafe url falls back to buttons. Modified clicks (Ctrl, Shift, middle button) are left
to the browser. The unavailable previous and next controls are disabled, and focus moves to the
current page when the control that was used is redrawn elsewhere or becomes unavailable, but only
if focus was inside the component and fell to the page, so not after a press the page cancelled or
when a listener of `idgPageChange` moved focus to something else.

### `idg-breadcrumb` and `idg-breadcrumb-item`

A `nav` landmark holding a list. `idg-breadcrumb`: `label` (default "Breadcrumb"), `separator`
(`chevron`, `slash`; mirrored in right-to-left). `idg-breadcrumb-item`: `href`, `current`; the last
item is the current page (`aria-current="page"`) and is not a link. Separators are hidden from
assistive technology.

## Layout

Six primitives that arrange content in a container of unknown width. They draw nothing of their
own: no colour, no border, no role. Source order is reading order, and they mirror in right-to-left
with logical properties only. They size against their **container**, never the viewport, so the
same markup works in a narrow column of a wide page, and they use no breakpoint and no script
except where noted.

Their defaults come from the layout axis (`data-layout`, see the
[tokens](../tokens/README.md#design-languages-layouts-and-ux-modes)), so the same markup has a
different measure, gap and column count under each of the eight layouts. A prop overrides the
layout with a **step** of a token scale; it never takes a length.

| Step set                                               | Values                                                                           | Used by                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| Gap steps, from the space scale (`--idg-space-<step>`) | `none`, `3xs`, `2xs`, `xs`, `s`, `m`, `l`, `xl`, `2xl`, `3xl`                    | `gap` on every primitive                       |
| Size steps, from the size scale (`--idg-size-<step>`)  | `xs` (10rem), `s` (14rem), `m` (20rem), `l` (28rem), `xl` (40rem), `2xl` (56rem) | `min`, `side-width`, `threshold`, `min-height` |

`gap="none"` is a gap of zero. A gap is multiplied by `--idg-density-gap-scale`, so a compact UX mode tightens every layout. A
value that is not a step (`"12px"`, `"var(--x)"`, a typo) is ignored and the layout's own value
applies, so a prop can never put a length or a declaration in a stylesheet. None of the primitives
sets an inline style. Each sets `overflow-wrap: anywhere` on its host, which the items inherit, so
a word wider than its container breaks instead of overflowing it, and the items may shrink below
their content's width.

### `idg-stack`

| Prop       | Attribute  | Values                              | Default            |
| ---------- | ---------- | ----------------------------------- | ------------------ |
| `gap`      | `gap`      | a gap step                          | `--idg-layout-gap` |
| `align`    | `align`    | `start`, `center`, `end`, `stretch` | `stretch`          |
| `dividers` | `dividers` | boolean                             | `false`            |

Children one under another. **Slot:** default. **Part:** `stack`. With `dividers`, a hairline in the
theme's border colour (`--idg-color-border`, which every design language shows, even those with no
border) is drawn above every child that is drawn except the first, with half the gap on each side of
it. Hidden children, templates, scripts and children for another slot are not drawn, so they never
get a rule. To tell which child is first, the stack sets `data-idg-stack-first` on it (and removes
it from the others, and when `dividers` is turned off); that attribute is the only thing any
primitive writes to your markup. The gap moves into the children's block padding to draw the rule,
so give those children no block padding of their own: a style of your own on a child wins over the
stack's. Keep the children direct children of the stack: items another component forwards through
a slot are not ruled.

### `idg-cluster`

| Prop      | Attribute | Values                                          | Default            |
| --------- | --------- | ----------------------------------------------- | ------------------ |
| `gap`     | `gap`     | a gap step                                      | `--idg-layout-gap` |
| `justify` | `justify` | `start`, `center`, `end`, `between`             | `start`            |
| `align`   | `align`   | `start`, `center`, `end`, `baseline`, `stretch` | `center`           |

Items in a row that wraps onto more rows, for tags, buttons or a toolbar. **Slot:** default.
**Part:** `cluster`.

### `idg-grid`

| Prop  | Attribute | Values      | Default                 |
| ----- | --------- | ----------- | ----------------------- |
| `min` | `min`     | a size step | `--idg-layout-grid-min` |
| `gap` | `gap`     | a gap step  | `--idg-layout-gap`      |

As many equal columns as fit, each at least `min` wide, and never more than `--idg-layout-columns`
(4 under `top-bar`, 8 under `dashboard`, 2 under `split-hero`, and so on), so a wide container does not
spread items thin. A container narrower than `min` has one column. **Slot:** default. **Part:**
`grid`. Because the cap comes from the layout, a `min` smaller than the layout's does not add
columns past it.

### `idg-sidebar`

| Prop        | Attribute    | Values         | Default                    |
| ----------- | ------------ | -------------- | -------------------------- |
| `side`      | `side`       | `start`, `end` | `start`                    |
| `sideWidth` | `side-width` | a size step    | `--idg-layout-aside-width` |
| `gap`       | `gap`        | a gap step     | `--idg-layout-gap`         |

A side region of a set width beside the content, which takes the rest. When the content would get
less than half of the container, the regions stack: the classic wrapping row, with no breakpoint.
**Slots:** `side` and default. **Parts:** `sidebar`, `side`, `content`. The side region is drawn
first at the `start` and last at the `end`, so the reading and Tab order always match what is shown;
stacked, a side region at the `start` is above the content and one at the `end` is below it. With
nothing drawn in the `side` slot, it takes neither its width nor its gap.
`start` and `end` follow the text direction.

### `idg-switcher`

| Prop        | Attribute   | Values      | Default            |
| ----------- | ----------- | ----------- | ------------------ |
| `threshold` | `threshold` | a size step | `l`                |
| `limit`     | `limit`     | 2 to 6      | none               |
| `gap`       | `gap`       | a gap step  | `--idg-layout-gap` |

Items of equal width in one row, which become one column when the container is narrower than
`threshold`. With `limit`, more items than that stack at any width. This is the one primitive that
reads script state: it counts the items its slot is given, including items another component forwards
to it, on load, on `slotchange` and when a child is hidden or shown, because CSS cannot count a
host's children from inside its shadow tree. Hidden items, templates, scripts and styles are not
counted. It reads no size. **Slot:** default. **Part:**
`switcher`.

### `idg-cover`

| Prop        | Attribute    | Values                   | Default            |
| ----------- | ------------ | ------------------------ | ------------------ |
| `minHeight` | `min-height` | a size step, or `screen` | `l`                |
| `gap`       | `gap`        | a gap step               | `--idg-layout-gap` |

A block at least as tall as `min-height` (`screen` is the height of the viewport) that centres its
content. It grows when the content needs more room. **Slots:** `top` (pinned to the top), default
(centred in the space the others leave) and `bottom`. **Parts:** `cover`, `center`.

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
  development. `www/csp-demo.html` is copied untouched and is the page to load under a CSP. Its
  overlays are wired by `demo.js`, an external module that imports `toast()` from the build.
- The custom-elements build was not loaded under the CSP: it needs a bundler, and runs the same
  runtime.

Component sources are scanned by `checks/` for `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`document.write`, `eval`, `new Function`, string event handlers and inline style strings, and the
stylesheets for hex, `rgb()`, `hsl()` and similar colour literals and raw `ms` or `s` durations. The
layout primitives' stylesheets are held to more: no length with a unit, signed or not (every size is a token; a zero is
allowed), no physical property such as `margin-left` or `width`, no `left` or `right` keyword in
`text-align`, `justify-content`, `justify-items` and the like, no three- or four-value `margin`,
`padding`, `inset`, `border-width`, `border-style` or `border-color` and no multi-value
`border-radius` (those are ordered by physical side or corner), and no viewport media query.

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
  accessibility tree beneath a card (one link) and across the overlays' shadow roots, focus
  movement and return, inertness, close reasons, keyboard paths, timers, 24px targets, a 320px
  viewport and forced colours for every overlay (axe runs with each one open), boundary contrast, text contrast of badges, alerts,
  avatars and changes in all 8 themes in light and dark, and axe (wcag2a, wcag2aa, wcag21aa, wcag22aa) across the 8 designs in light and dark and
  the 8 UX modes, no sideways page scroll at 320, 768, 1280 and 2560px under all 8 layouts, and the
  layout primitives' wrapping, column counts and right-to-left placement, on pages in `src/fixtures/` (`button.html`, `forms.html`, `surfaces.html`, `overlays.html`, `navigation.html`, `layout-primitives.html`; copied to `www/fixtures/`; static HTML, no inline
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
