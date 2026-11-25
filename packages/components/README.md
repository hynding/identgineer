# @identgineer/components

Stencil web components, namespace `identgineer`, tag prefix `idg-`. Every colour, size, radius,
border, shadow and duration comes from an `--idg-*` token of
[`@identgineer/tokens`](../tokens/README.md), so the components follow the theme, design language,
layout and UX mode set on the page and never carry a style of their own.

## Accent fills and state indicators

The accent appears in three ways, and each reads its own colour role:

- A **fill** carries a text label (a primary button, an accent card, the skip link) and only needs
  its text to read: `accent` with `on-accent`. A light brand keeps its own colour here, even below
  3:1 against the page. Where the accent does not stand out on the page, a primary button would
  look like the secondary one, so it gets a 2px outline of `accent-edge`, outside whatever border
  the design gives every control: the theme's `accent-border` where the accent does not stand
  out, and `transparent`, so nothing is drawn, where it does. Focus replaces the outline with the
  focus ring, and forced colours drop it: there the preferences layer gives every control a solid
  system-colour border, even in designs that draw none.
- An **indicator** identifies state or selection on the page, so it needs 3:1 against what it sits
  on (WCAG 1.4.11): `accent-indicator`, with `on-accent-indicator` for a glyph or number on it.
- A **tint** is the faint `accent-subtle` wash of hover feedback, with `on-accent-subtle` for its
  text. It is about 1.1:1 on the page, so where it shows a state it is not enough alone: the
  current navigation item also carries an `accent-indicator` mark, and the pressed password reveal
  changes its icon. The check names what marks each such tint.
- **Decoration** identifies nothing and stays on `accent`.

Every use in the component stylesheets, checked by `checks/accent-roles.test.ts` so a new one has
to be classified:

| Where            | What                                             | Role                                      | Use        |
| ---------------- | ------------------------------------------------ | ----------------------------------------- | ---------- |
| `idg-checkbox`   | checked or mixed box, and its check              | `accent-indicator`, `on-accent-indicator` | indicator  |
| `idg-radio`      | checked dot                                      | `accent-indicator`                        | indicator  |
| `idg-switch`     | track and thumb when on                          | `accent-indicator`, `on-accent-indicator` | indicator  |
| `idg-progress`   | fill and indeterminate band                      | `accent-indicator`                        | indicator  |
| `idg-sparkline`  | line, end mark and fill                          | `accent-indicator`                        | indicator  |
| `idg-pagination` | current page and its number                      | `accent-indicator`, `on-accent-indicator` | indicator  |
| `idg-tab`        | selected tab marker                              | `accent-indicator`                        | indicator  |
| `idg-card`       | outlined interactive card, hovered ring          | `accent-indicator`                        | indicator  |
| `idg-layout`     | current navigation item: underline in a row, bar | `accent-indicator`                        | indicator  |
| `idg-layout`     | current navigation item, behind the mark         | `accent-subtle`, `on-accent-subtle`       | tint       |
| `idg-button`     | primary fill, label and hover                    | `accent`, `on-accent`, `accent-hover`     | fill       |
| `idg-button`     | primary edge where the accent does not stand out | `accent-edge`                             | fill       |
| `idg-card`       | accent variant and everything on it              | `accent`, `on-accent`                     | fill       |
| `idg-avatar`     | first colour pair of the initials                | `accent`, `on-accent`                     | fill       |
| `idg-brand-logo` | monogram standing in for a brand's mark          | 117,086                                   | 327,029    |
| `idg-layout`     | skip link                                        | `accent`, `on-accent`                     | fill       |
| `idg-layout`     | hero glow                                        | `accent`                                  | decoration |
| demo page        | background glow                                  | `accent`                                  | decoration |

Hovered controls and links read the tint too; their rows are left out here, and the check lists
them. Where the navigation stands in a column (a disclosure, a drawer, or the rail or panel of a
layout) the current item has a bar at its inline start, taken out of its padding so the label stays
put; where the items run in a row it is underlined.

Links use `link`, and the focus ring uses `focus-ring`; neither is part of this table.

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

`selectText()` (a method of `idg-input` only) selects the text of the native input, for a read-only
value that is meant to be copied, such as a link; it does not focus it, so call `setFocus()` too.

Slots `start` and `end` sit inside the box. Parts: `box` (the box that draws the edge, around the
native input and the slots) and `control` (the native input), for a composite that lays out what
it slots, as `idg-brand-editor` lets its hex field wrap below its colour picker. The reveal control is a real `<button type="button">`
with `aria-pressed`; it changes only the native input's `type`, never the value. A shown password is
hidden again when its form is submitted (before the submit event's listeners run), when the form
is reset and when the value is set from outside, such as a form clearing it.

**Enter submits the form** as Enter in a native input does in Chromium, following the HTML implicit
submission algorithm, since the native input has no form owner across the shadow boundary and the
browser would not do it. It is done on the keypress, as the browser does: a keydown cancelled with
`preventDefault()` has no keypress, and the decision is made once the keypress has reached every
listener, so any listener on its path (a combobox around the field) can cancel either. It never
happens while an input method is composing, nor with Control, Alt or Meta held (Shift+Enter
submits), nor for a key event a script dispatches (`isTrusted` false), which a native input ignores
too. The default button (the first submit button among the form's elements: a native submit button
or an `idg-button type="submit"` without an `href`, which is a link and is never followed) is
clicked, so its click listeners run; a disabled or `loading` default button stops the submission.
Without a submit button, the form is submitted only when it has no other text field; as in Chromium,
a date or time field does not count. Two differences from a native input remain. A listener that
stops the keypress from reaching the element (`stopPropagation()` in the capture phase at `window`
or `document`) prevents it, since the element hears the keypress on its way out of the shadow root.
And with an `idg-button` as the default button, `SubmitEvent.submitter` is `null`: the button's
native control is inside its own shadow root, so it cannot be the form's submitter; read the
button's value some other way. A native submit button is the submitter as usual.

`spellcheck` is given to the native input as an attribute, so `spellcheck="false"` turns spell
checking off.

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

The options are copied only when the slotted ones differ from the last copy (compared as text), so
a render for another reason, such as `invalid` or `disabled` changing or a new value, leaves the
native options, and a choice being made among them, alone. A `value` that matches no option is kept
only while there are no options at all (a list that arrives later, which the mirror applies when its
option arrives). Once there are options, a value that matches none gives way to the option shown,
so the value, the submitted form value and the option shown always agree. The validity follows the
value that is chosen after the options are copied, including when it was set from script; a
disabled select is not validated, as a native one is not.

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

Part `group` is the box that arranges the radios (a flex column or row). A page can lay them out
itself with `idg-radio-group::part(group)`, for example as a grid; the switcher does.

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
| `quiet`        | `quiet`         | boolean                                | `false`   |

- **Slots:** `title` and the default slot (the message). **Parts:** `alert`, `icon`, `title`, `body`,
  `dismiss`. Each variant has its own icon.
- **Announcement.** `warning` and `danger` are `role="alert"` (assertive); `info` and `success` are
  `role="status"` (polite). The role carries the live behaviour, and no `aria-live` is added beside
  it, which would announce a message twice. A live region announces what is inserted, not what was
  on the page already, so render an alert at the moment it applies. `quiet` drops the role and keeps
  the look, for a message that changes while it is shown (such as a countdown), which would
  otherwise be announced at every change; announce it some other way.
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
holds something like a sparkline beside the figures. `period` (text such as `vs the 7 days before`)
is shown beside the change, and spoken with it ("Increased by 12.4%, vs the 7 days before"); it is
drawn only with a change. Parts: `label`, `value`, `delta`, `period`. Labels sit
on the surface's normal text colour, so use `idg-stat` on `plain`, `raised` or `outlined` cards.

### `idg-divider`

`orientation` (`horizontal`, `vertical`) and `decorative`. It is a native `<hr>`; `decorative`
gives it `role="presentation"`. The rule is the design's own border (thick in brutalist, double in
pixel, a hairline in editorial) over a theme-coloured hairline that stands in where a design draws no
border (soft, elevated), and it is never thinner than 1px. A vertical divider needs a parent with a
height. A horizontal divider stretches across its flex or grid container, so it is as wide as an
`idg-stack` whatever its `align`; inside an `idg-cluster`, which is a row, use
`orientation="vertical"`. Part: `line`.

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

**Forwarded items.** The menu finds its items through slots: in its default slot's flattened
assignment, inside any `idg-menu-group` there, and through a `<slot>` in such a group. A component
that wraps `idg-menu` in its own shadow root can therefore forward the page's items into a group of
its own, as `idg-user-menu` does. The menu's width is at least 12rem but never more than the
viewport, so it fits a 320px screen at 200% text.

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
(`min-width`), `sortKey`, `sortDirection`, `manualSort`, `busy`, `sortStatus` (the live-region text pattern, with `{column}` and `{direction}`), `sortAscendingLabel`
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
  `manual-sort` the table moves no rows and a press only reports `idgSort` with the sort it asks for:
  the column marked and the sort announced are the ones the owner sets in `sortKey` and
  `sortDirection`, so a header never shows an order the rows are not in. `busy` marks the buttons
  `aria-disabled` and swallows presses while the owner loads. The buttons
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

A `pageCount` above ten million is held to it, and `siblings` and `boundaries` to ten, so the
list never has more slots or longer numbers than a narrow page holds.

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

| Step set                                               | Values                                                                                          | Used by                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Gap steps, from the space scale (`--idg-space-<step>`) | `none`, `3xs`, `2xs`, `xs`, `s`, `m`, `l`, `xl`, `2xl`, `3xl`                                   | `gap` on every primitive                       |
| Size steps, from the size scale (`--idg-size-<step>`)  | `xs` (10rem), `s` (14rem), `m` (20rem), `l` (28rem), `xl` (40rem), `2xl` (56rem), `3xl` (72rem) | `min`, `side-width`, `threshold`, `min-height` |

`gap="none"` is a gap of zero. Every other gap, a step or the layout's `--idg-layout-gap` by default, is multiplied by `--idg-density-gap-scale`, so a compact UX mode tightens every layout. A
value that is not a step (`"12px"`, `"var(--x)"`, a typo) is ignored and the layout's own value
applies, so a prop can never put a length or a declaration in a stylesheet. None of the primitives
sets an inline style. A word that is wider than its container, with nothing to break it, is the
content's concern: the primitives set no `overflow-wrap` and no minimum width on their items, so a
table, a button or an image keeps the behaviour it has outside them.

### `idg-stack`

| Prop    | Attribute | Values                              | Default                                        |
| ------- | --------- | ----------------------------------- | ---------------------------------------------- |
| `gap`   | `gap`     | a gap step                          | `--idg-layout-gap` × `--idg-density-gap-scale` |
| `align` | `align`   | `start`, `center`, `end`, `stretch` | `stretch`                                      |

Children one under another. **Slot:** default. **Part:** `stack`. It is a plain flex column with a
gap and draws nothing of its own. For a rule between items, put an `idg-divider` between them: the
stack's gap sits on either side of it.

```html
<idg-stack>
  <p>First</p>
  <idg-divider></idg-divider>
  <p>Second</p>
</idg-stack>
```

### `idg-cluster`

| Prop      | Attribute | Values                                          | Default                                        |
| --------- | --------- | ----------------------------------------------- | ---------------------------------------------- |
| `gap`     | `gap`     | a gap step                                      | `--idg-layout-gap` × `--idg-density-gap-scale` |
| `justify` | `justify` | `start`, `center`, `end`, `between`             | `start`                                        |
| `align`   | `align`   | `start`, `center`, `end`, `baseline`, `stretch` | `center`                                       |

Items in a row that wraps onto more rows, for tags, buttons or a toolbar. **Slot:** default.
**Part:** `cluster`.

### `idg-grid`

| Prop  | Attribute | Values      | Default                                        |
| ----- | --------- | ----------- | ---------------------------------------------- |
| `min` | `min`     | a size step | `--idg-layout-grid-min`                        |
| `gap` | `gap`     | a gap step  | `--idg-layout-gap` × `--idg-density-gap-scale` |

As many equal columns as fit, each at least `min` wide, and never more than `--idg-layout-columns`
(4 under `top-bar`, 8 under `dashboard`, 2 under `split-hero`, and so on), so a wide container does not
spread items thin. A container narrower than `min` has one column. **Slot:** default. **Part:**
`grid`. Because the cap comes from the layout, a `min` smaller than the layout's does not add
columns past it.

### `idg-sidebar`

| Prop        | Attribute    | Values         | Default                                        |
| ----------- | ------------ | -------------- | ---------------------------------------------- |
| `side`      | `side`       | `start`, `end` | `start`                                        |
| `sideWidth` | `side-width` | a size step    | `--idg-layout-aside-width`                     |
| `gap`       | `gap`        | a gap step     | `--idg-layout-gap` × `--idg-density-gap-scale` |

A side region of a set width beside the content, which takes the rest. When the content would get
less than half of the container, the regions stack: the classic wrapping row, with no breakpoint.
**Slots:** `side` and default. **Parts:** `sidebar`, `side`, `content`. The side region is drawn
first at the `start` and last at the `end`, so the reading and Tab order always match what is shown;
stacked, a side region at the `start` is above the content and one at the `end` is below it. With
nothing drawn in the `side` slot, it takes neither its width nor its gap. "Nothing" means no
element, or only elements with the `hidden` attribute (a class-hidden element counts), and an empty
element still counts as content. A change while the sidebar is detached is read again when it is put
back, and hiding or showing a forwarded item is not observed, only `slotchange`.
`start` and `end` follow the text direction.

### `idg-switcher`

| Prop        | Attribute   | Values      | Default                                        |
| ----------- | ----------- | ----------- | ---------------------------------------------- |
| `threshold` | `threshold` | a size step | `l`                                            |
| `limit`     | `limit`     | 2 to 6      | none                                           |
| `gap`       | `gap`       | a gap step  | `--idg-layout-gap` × `--idg-density-gap-scale` |

Items of equal width in one row, which become one column when the container is narrower than
`threshold`. With `limit`, more items than that stack at any width. This is the one primitive that
reads script state: it counts the items its slot is given, including items another component forwards
to it, on load, on `slotchange` and when a child is hidden or shown, because CSS cannot count a
host's children from inside its shadow tree. "Hidden" means the `hidden` attribute: an item hidden
by a class or a style is counted. Templates, scripts and styles are not counted, and neither are
text nodes. Hiding or showing an item that another component forwards is not observed, only a
change of what is forwarded (`slotchange`). A change made while the element is detached is read
again when it is put back. It reads no size. **Slot:** default. **Part:** `switcher`.

### `idg-cover`

| Prop        | Attribute    | Values                   | Default                                        |
| ----------- | ------------ | ------------------------ | ---------------------------------------------- |
| `minHeight` | `min-height` | a size step, or `screen` | `l`                                            |
| `gap`       | `gap`        | a gap step               | `--idg-layout-gap` × `--idg-density-gap-scale` |

A block at least as tall as `min-height` (`screen` is the height of the viewport) that centres its
content. It grows when the content needs more room. **Slots:** `top` (pinned to the top), default
(centred in the space the others leave) and `bottom`. **Parts:** `cover`, `center`.

### `idg-layout`

The page shell. One page, written once, is housed by whichever of the eight layouts `data-layout`
names, on the root or on any ancestor, with no change of markup. Its shadow tree is always the same:
a skip link, a `header` (brand, menu button, navigation, actions), the hero, `main`, `aside` and
`footer`. No layout reorders it, so the order a reader and the Tab key meet things in is the order of
the markup, and the shell adds no heading of its own. A region with nothing slotted into it is not
drawn and is not announced.

| Slot         | Region                                                   |
| ------------ | -------------------------------------------------------- |
| `brand`      | The name or logo, usually a link                         |
| `navigation` | The navigation items, as direct children (links)         |
| `actions`    | Buttons and links of the header, such as a sign-in       |
| `hero`       | An introduction above or beside the content              |
| default      | The content, inside `main` (the target of the skip link) |
| `aside`      | Related content, a `complementary` landmark              |
| `footer`     | The footer, a `contentinfo` landmark                     |

| Prop                      | Attribute                   | Default             |
| ------------------------- | --------------------------- | ------------------- |
| `navigationLabel`         | `navigation-label`          | `Main navigation`   |
| `asideLabel`              | `aside-label`               | `Related content`   |
| `skipLabel`               | `skip-label`                | `Skip to content`   |
| `menuLabel`, `closeLabel` | `menu-label`, `close-label` | `Menu`, `Close`     |
| `navigationOpen`          | `navigation-open`           | `false` (reflected) |
| `embedded`                | `embedded`                  | `false` (reflected) |

**Event:** `idgNavigationToggle`, with `{ open }`. **Parts:** `shell`, `skip`, `header`, `brand`,
`toggle`, `drawer`, `close`, `navigation`, `actions`, `hero`, `main`, `aside`, `footer`.

The host is a size container: each layout picks its small (below 40rem), medium (from 40rem) and
large (from 72rem) arrangement from the width of the shell, not of the viewport. The thresholds are
the `xl` and `3xl` steps of the size scale (`--idg-size-3xl` is 72rem, added for this). The bar of
`top-bar`, `split-hero` and `bento` joins the actions to the brand and the menu button on one row from
the `2xl` step (56rem), not from 40rem.

| Layout       | Arrangement                                                                       | Navigation small / medium / large |
| ------------ | --------------------------------------------------------------------------------- | --------------------------------- |
| `top-bar`    | A bar across the top, pinned at large; the aside beside the content               | panel / panel / inline            |
| `side-rail`  | A rail for the full height with the brand on top; actions in a strip; aside below | drawer / inline / inline          |
| `split-hero` | The hero keeps the start half in view while the content scrolls beside it         | panel / panel / panel             |
| `magazine`   | A centred masthead, a ruled strip of navigation, a narrow column of related items | panel / inline / inline           |
| `dashboard`  | A slim rail, a pinned strip of actions, the aside as an inspector at the end      | drawer / inline / inline          |
| `centered`   | One narrow column; brand and navigation above, aside and footer below             | panel / inline / inline           |
| `bento`      | Every region a tile on one grid of one, two, then four columns                    | panel / panel / inline            |
| `immersive`  | A full-bleed hero under a transparent header; the aside a band, then a tile       | drawer / drawer / drawer          |

"Multi-column" in `magazine` is the layout's column count, read by `idg-grid` in the content, not CSS
columns. A **panel** is the navigation opened under the menu button, without trapping focus or making the page
inert; a **drawer** is a modal dialog (`showModal`): focus moves in, the page behind is inert and
scroll-locked, Escape or the close button or a press on the backdrop closes it and focus returns to
the menu button. Following a link closes either. If the container grows until the navigation is drawn
inline, an open panel or drawer is reset without moving focus. The drawer slides in but does not
animate out.

Changing `data-layout` while the page is open keeps the scroll position and keeps focus on the same
element; focus that was in a navigation the new layout collapses goes to the menu button. Where a
layout pins its chrome (`top-bar` at large, `dashboard`), `scroll-padding-block-start` is set on the
document from `--idg-layout-sticky-inset`, so a focused or targeted element is never left under it.

While a panel is open in `top-bar`, `bento` and `split-hero`, the actions move below it, so Tab goes
from the menu button through the navigation to the actions without jumping back up the page. In
`top-bar` at 72rem and wider the navigation is one row that scrolls along itself when it is longer
than the bar (a focused item is scrolled into view, and the scrollbar fits in the bar); in `side-rail` and `dashboard` the rail is a column of the brand, which takes the height it needs,
and the navigation under it, which scrolls. The menu button does not move when the panel opens: the first row of the header is held at the height it had while the panel is open.

**Missing regions.** A layout that has no hero arranges itself without one: the `immersive` header
becomes a bar of the page on a surface of its own instead of being laid over the hero, and
`split-hero` stays one column instead of leaving half of the page empty. A split hero is pinned
only while it fits in the window: one taller than the window (a short window, larger text, a long
hero) scrolls with the page, and the content still scrolls beside it, so nothing of it is hidden. A region with nothing slotted
into it is not drawn, and the layouts leave no gap for it.

**Escape and focus.** Escape closes an open panel only when it happens in the menu button or the
navigation and nothing has already used it. Closing the navigation from the page (setting
`navigationOpen` to `false`) does not move focus the page has put elsewhere. If the container grows
while a drawer is open and the navigation is now drawn on the page, a focused navigation item that is
still visible keeps focus; focus that was on the Close button, which is gone, moves to the first
navigation item (or to the menu button if that is shown). A click on a link with a modifier key,
or with a button other than the primary one, does not close the navigation.

**Embedded.** A shell is the page and claims at least the height of the window. Set `embedded` on one
that sits inside a page, or inside another shell, and in all eight layouts it takes the height its
content needs: a rail, a sticky hero, an inspector or a hero that is as tall as the window stops
being. An aside that is a card stays a card; only the dashboard's inspector, a column the height of
the page, is stretched.

**Scroll padding.** `scroll-padding-block-start` is set on the root element from
`--idg-layout-sticky-inset`, so it applies at every width and to every scroller that is the page, not
only while a layout pins its chrome. The inset is `0` in the layouts that pin nothing. The browser
would otherwise treat the pinned bar's own controls as too near the top and scroll the page up
whenever one was focused, so the brand, navigation and actions the page slots in cancel the padding
for themselves: each sets `--_idg-chrome-scroll-margin` to the negative inset, and their `idg-`
controls (buttons, links, inputs, checkboxes and the rest) read it in their own shadow roots as
`scroll-margin-block-start`. The padding stays on for everything else, so a script that scrolls a
target into view while the bar has focus still lands it under the bar, not behind it (but see the
text field exception below). A control from
outside this library that has its own shadow root and a focusable element in the bar must read the
same property (`scroll-margin-block-start: var(--_idg-chrome-scroll-margin, 0px)`), or focusing it
can scroll the page. The exception is a text field: the browser's reveal of an editable element
ignores `scroll-margin` and uses the root padding, so while a text-entry element in the bar has focus
(a native `input` other than a checkbox, radio or button, a `textarea`, a `contenteditable`, or an
`idg-input` or `idg-textarea` with focus inside) the root padding is `0`, and the page stays put. While such a field has focus the page padding is off, so a script scroll at
that moment can land its target under the bar. A
text-entry component from outside this library is not recognised unless it is a native element or
reports focus on its host. The drawer that holds a long navigation is padded by the same inset, so a
focused item stays inside its top edge. A navigation that scrolls along the top bar scrolls only itself to bring a
focused item into view, never the page.

**Open from the start.** `navigation-open` in the markup opens the navigation once the shell has
loaded, if the layout collapses it at that width.

**Without container style queries.** A browser that cannot read a style query draws every layout as
its small arrangement: a bar of brand, menu button and actions above one column, with the navigation
as a panel under the menu button. It is plain and fully usable, and the eight layouts differ again
once the browser supports them.

**Text wider than its column.** The hero and the brand let a word they cannot fit break anywhere
(`overflow-wrap: anywhere`; in the hero it is inherited by what the page puts there). Where the brand
shares a bar with the menu button and the actions (top-bar, split-hero and bento, from 56rem), the
button and the actions take their width first, never less than the widest action, and the brand keeps
at least `--idg-size-s` or two fifths of the bar. A longer name wraps between words, and breaks inside
a word only when that word is wider than the brand's share. Below 56rem those three layouts keep the
stacked header, with the actions on a row of their own, because brand, button and actions do not all
fit on one row in the larger type scales or a wider font. Nothing is clipped and the page does not
scroll sideways; ordinary words elsewhere never break, because a word only breaks where it is wider
than the line.

## Variation switcher

### `idg-variation-switcher`

A control panel with which a visitor changes the four variation axes and the colour scheme of the
page. It is built on [`@identgineer/variations`](../variations/README.md), which this package
depends on, and it always acts on the document's root element: the page's attributes stay the
single truth. Put the bootstrap script of that package in the `<head>` so a remembered or shared
choice is applied before first paint.

```html
<idg-variation-switcher heading="Appearance" persist></idg-variation-switcher>
<idg-variation-switcher axes="theme,scheme" orientation="inline"></idg-variation-switcher>
```

| Prop          | Attribute     | Values                                                      | Default   |
| ------------- | ------------- | ----------------------------------------------------------- | --------- |
| `persist`     | `persist`     | boolean: save each change with the runtime's persistence    | `false`   |
| `axes`        | `axes`        | comma separated `theme`, `design`, `layout`, `ux`, `scheme` | all five  |
| `orientation` | `orientation` | `stacked`, `inline`                                         | `stacked` |
| `heading`     | `heading`     | visible heading, which also names the panel                 |           |

- **Controls.** Theme is a radio group of the eight themes, each with a swatch of its colours in both
  schemes. Design, Layout and UX are selects of the eight registry options (label from `REGISTRY`),
  and Scheme is a radio group of System, Light and Dark. Each is an `idg-field`, so it has a visible
  label, an accessible name, and the chosen option's description as its hint (shown in the `guided`
  mode and always part of the accessible description). `axes` shows a subset in the panel's own order;
  unknown names are ignored, and a list with no known name shows every control.
- **Actions.** "Surprise me" applies `shuffleVariations()` (the scheme is left alone), "Reset"
  removes every attribute (and the stored choice, with `persist`), and "Copy link" writes
  `variationsUrl(state, location.href)` with `navigator.clipboard.writeText`. If the clipboard is
  missing, blocked or refuses, the link is shown in a read-only field, focused, to be copied by hand;
  `document.execCommand` is never used. Every result is announced in a polite live region. The copy
  result is also shown as text; the other messages are for assistive technology only.
- **Persist.** With `persist` the panel passes `{ persist: true }` to `applyVariations` and
  `resetVariations`. The panel itself never reads storage: the bootstrap script applies the stored
  choice before paint. Without the bootstrap script the choice is saved but only restored by your
  own code (`loadVariations()`).
- **Sync.** The panel subscribes with `onVariationsChange` when it is connected and unsubscribes when
  it is disconnected, so it shows a change made by markup, a script or another switcher. Several
  switchers on a page stay in step without feedback loops: only the panel the visitor used emits.
- **Event.** `idgVariationsChange`, detail `{ state, changed }` (type `VariationsChangeDetail`), when
  the visitor changes something through the panel and something actually changed. A change made
  elsewhere does not fire it; listen to `onVariationsChange` for that. The inner controls' own
  `idgChange` does not leave the panel.
- **Parts:** `panel`, `heading`, `controls`, `actions`, `status`.
- **Layout.** The host is a size container: `stacked` is one column, and two from 40rem
  (`--idg-size-xl`) with the theme across both; `inline` puts controls side by side as far as they
  fit. Below 20rem (`--idg-size-m`, which is wider in pixels at large text sizes) the padding is
  reduced. Each control is a size container of its own: the theme options are one column, two from
  24rem and four from 44rem, and the scheme is one column or, from 32rem, one row of three, always
  on aligned tracks (laid out through `idg-radio-group::part(group)`). The host needs a width of its own (it is a block, so it fills its parent; in a flex or
  grid parent give it `min-inline-size: 0` and a width). Verified at 320px to 1920px, at 200% text
  with a wider face, in right-to-left text, and in every layout.
- **Accessibility.** The panel is a `role="group"` named by `heading`, or "Appearance". Everything is
  keyboard operable: the theme and scheme groups have one tab stop and arrows choose (the horizontal
  arrows swap in right-to-left text), the selects change with the arrow keys, and the buttons take
  Enter and Space. Targets follow `--idg-density-target-size`. axe reports nothing in any UX mode or
  design, in both schemes. In `forced-colors` the swatches keep their colours (`forced-color-adjust:
none`) and get an edge in `CanvasText`. The panel has no motion of its own.
- **CSP.** A swatch is an inline `svg` whose `fill` attributes are set from the registry. SVG
  presentation attributes are not inline styles, so `style-src 'self'` does not govern them, and
  nothing writes a `style` attribute or property. Each colour is checked to be a hex colour before it
  reaches an attribute. Everything that comes from the URL or storage goes through
  `@identgineer/variations`, which accepts only registry ids. There is no `innerHTML`, `eval` or
  `execCommand`.
- **Server rendering.** Nothing touches the DOM when the module is loaded. The state is read when the
  element connects.
- **Bundle.** The Stencil build compiles the variations source into the components' own chunks
  (about 5 KB gzipped); `@identgineer/tokens` is not part of it. This holds for the lazy loader
  (`dist/identgineer`), the custom-elements build (`dist/components`) and `www`. The `dist/collection`
  output is different: it is not bundled, so its switcher files keep a bare
  `import … from "@identgineer/variations"`, and that package is TypeScript source until it is
  published with built output (planned with the publishing feature). Until then the collection
  output is not a supported entry for this component. Consume the loader or the custom-elements
  build.
- **Types.** The switcher's public types (`VariationsChangeDetail`, `VariationState`, `StateKey`,
  `ThemeId`, `DesignId`, `LayoutId`, `UxModeId`, `SchemeChoice`, `SwitcherOrientation`) are declared in
  this package, so `dist/types` never refers to the variations source. A compile-time test holds them
  identical to the variations package's own, and a check over the built declarations fails if any of
  them imports from `@identgineer/variations`.

## Identity

Six elements put the identity client of `@identgineer/identity` on a page. Each takes the client
as a JavaScript property, `client`, typed by a local structural interface (`SignInClient`,
`RegisterClient`, `PasswordResetClient`, `ProfileClient`, `SessionGuardClient`,
`UserMenuClient`, exported as types). The elements never create a client, never import the
identity package (it is a devDependency, for tests and the type check only; `checks/` holds that
no shipped source, declaration or bundle carries it) and store nothing in the browser. A client
assigned late or swapped is followed, and the old one is unsubscribed; so is every client when
the element leaves the page.

Guides: [plain HTML](../../docs/identity/plain-html.md), [React](../../docs/identity/react.md),
[Vue](../../docs/identity/vue.md), [Angular](../../docs/identity/angular.md), and the
[security notes](../../docs/identity/security.md), which say what the elements do not do:
`idg-session-guard` is not access control.

What the forms share:

- **Password managers.** Real `autocomplete` values on the native inputs, `autocapitalize="none"`
  and `spellcheck="false"`; Enter submits; the submit button is disabled only while a request is
  pending (as `loading`). See the autofill notes under `idg-input` for what shadow DOM means for
  managers.
- **Errors.** One fixed message per error code (`invalid-credentials` is one message for every
  cause); the server's own text is never shown. Missing or invalid fields get `aria-invalid` and
  their message as the description through `idg-field`; focus moves to the first of them, and a
  summary `idg-alert` (`role="alert"`, part `error`) is drawn afresh for every attempt.
  `throttled` shows a live countdown in a `quiet` alert (part `throttle`), announced through a
  polite status once when it starts and once when it ends. `network` adds "Try again".
- **Passwords** are read from the input at submit and never kept in the element's state. The input
  is emptied once the server has accepted or refused it and when the element is removed. A
  password never reaches an attribute, a text node or an event.
- **Enumeration parity.** Registration (with email confirmation on) and the reset request render
  the same markup and accessibility tree for an existing and a missing account.
- **Events** bubble and are composed; no detail carries a password, a token or an email address.
  Inner controls' `idgInput` and `idgChange` stay inside the form.
- **`labels`**: a partial object of strings merged over the English defaults (`SignInLabels` and
  the others are exported). Assign a new object to change it. `{name}`, `{time}`, `{used}` and
  `{max}` are filled in.
- **`clock`** (forms with a countdown): `{ setTimeout, clearTimeout }` for the countdown's ticks,
  for tests; the browser's timers by default.
- **Width.** The forms and `idg-profile` fill their container. In a parent that sizes them by
  their content (a flex row, an auto grid track, `fit-content`, `idg-cluster`, a `<dialog>` or a
  popover) they take the identity measure, `--idg-identity-measure` (`var(--idg-size-m)`, 20rem, by
  default; set it on any ancestor), and shrink below it on a narrow screen. The measure is a
  length, in any unit, and `em` or `ch` is the element's own. A percentage is not a valid measure:
  it is ignored, and in such a parent the element is then as wide as the page's tab size
  (`tab-size`, eight spaces by default). Leave the element's own `display` as it is: as a flex or
  grid container it would lay its measure out as an item of its own, with the gap after it. Each
  is an inline-size container, so with large text on a narrow screen (narrower than nine of its own
  ems) the controls' inline padding and the gaps shrink; at normal text size every UX mode keeps
  its own.

### `idg-sign-in`

Identifier (`autocomplete="username webauthn"`, `inputmode="email"`) and password
(`current-password`, with a reveal toggle). Props `client`, `labels`, `providers` (`{ name, label
}[]`, one button each) and `providerCallback` (passed to `providerSignInUrl` as `callback`).
Events `idgSignedIn` (`{ user: { id, username } }`) and `idgProviderSignIn` (`{ provider, url }`,
cancelable; by default the element then calls `location.assign(url)`). Slots `reset` and
`register`; parts `form`, `error`, `throttle`, `providers`.

### `idg-register`

Username, email and a new password with a reveal toggle and a byte count against bcrypt's 72-byte
limit (part `byte-count`; "73 of 72 bytes used" marks the field, each number in a `<bdi>`, and the
`passwordBytes` label is one sentence with `{used}` and `{max}`, so a translation sets their
order). Props `client`, `labels`. Event
`idgRegistered`: `{ outcome: "check-email" }` (a neutral confirmation, the same for an address
already taken) or `{ outcome: "signed-in", user }`. The confirmation (part `confirmation`) replaces
the form and takes focus. Slot `sign-in`; parts `form`, `error`, `throttle`, `byte-count`,
`confirmation`.

### `idg-password-reset`

`mode` (reflected): `request` asks for the address and always shows the same confirmation, with
`idgResetRequested`; `complete` sets a new password and its confirmation (both `new-password`,
checked for length and match) with the code from the `code` prop, or from a `one-time-code` field
when there is none, and signs in, with `idgPasswordReset` (`{ user }`). Props `client`, `labels`.
Slots `request` (in `complete` mode, a link to ask again) and `sign-in`; parts `form`, `error`,
`throttle`, `byte-count`, `confirmation`.

### `idg-profile`

The signed-in owner's page, in three sections: the profile (`displayName`, `bio`, `locale`,
`timezone`, `marketingOptIn`, read with `getProfile` and saved with `saveProfile`, beside an
`idg-avatar` from `avatarSrc`), a password change (current, new and confirmation, with a read-only
`username` idg-input laid out out of sight and out of the tab order, so a manager can tell the
account, and the same said in visible text above the fields, part `password-account`: "Changing the
password for {name}") and the sessions, each with "Sign out", plus "Sign out everywhere". Props
`client`, `avatarSrc`, `headingLevel` (`heading-level`, 2 to 6, default 2, for the three section
headings), `labels`, `clock`. Events `idgProfileSaved` (`{ profile }`), `idgPasswordChanged`,
`idgSessionRevoked` (`{ id }`), `idgSignedOut` (`{ outcome, everywhere: true }`). Parts `details`,
`details-saved`, `password`, `password-account`, `password-saved`, `byte-count`, `sessions`,
`session`, `error`, `throttle`, `outcome`, `signed-out`. It reloads when another user signs in, and
shows only a note while nobody is.

### `idg-session-guard`

The default slot only while signed in, `fallback` while signed out, `pending` while the state is
unknown; nothing is drawn as protected before the client knows. It calls `restore()` once while
the state is unknown (once per client, across all elements). When that restore cannot reach the
server it shows a notice (part `unreachable`) with "Try again" (part `retry`) in place of `pending`,
and tries again when the browser is back online. A `server-unreachable` sign-out from its content
(`idgSignedOut` from inside, such as `idg-profile`'s "Sign out everywhere") is kept in view above
the fallback (part `sign-out-outcome`, dismissible; slot `sign-out-outcome` replaces the text),
since the content that would have said so is gone. Prop `labels`. Event `idgSessionChange` on each
transition: `{ status: "signed-in" }`, `{ status: "unknown" }`, `{ status: "unreachable" }` or
`{ status: "signed-out", reason }`.

**Layout.** The guard adds no box: the host is `display: contents` and its slots are its shadow
root's own children, so what it shows is laid out as the parent's own children (a flex row's or a
grid's items), and it adds no group or landmark to the accessibility tree. A notice, when one is
shown, is one extra block before the content (part `notice`, holding part `unreachable` or
`sign-out-outcome`); it takes the identity measure as the forms do.

**Focus.** When a transition takes away what had focus (a sign-in from the fallback, a sign-out
from the content or by the page's own `signOut()`, "Try again", dismissing the warning), focus goes
at once to a hidden anchor of the guard's own: absolutely positioned and clipped, so it is no item
of the parent's layout, placed before the content, so Tab goes on into the content and Shift+Tab
back before the guard. Its text is the change ("You are signed in." or "You are signed out.", in
`labels`), in place before it takes focus and read once as focus lands; no live region says it
again. While a retry waits for the server, whether from "Try again" or from the browser coming
back online, its notice stays, the button busy (`loading`) and focus where it was; the answer then
moves focus once, if focus is in the guard: to the anchor with the outcome as its text, or, when
the server still cannot be reached, to the notice. Pressing "Try again" during a retry asks the
server nothing more. A warning that appears while focus is still on the anchor takes focus and is
read then (its live role left out); one that appears after the user has moved on is announced by
its `role="alert"` and leaves focus where it is. The guard writes no `tabindex` on
anything it does not own: on a custom element host it would take the host's whole shadow tree
out of the Tab order. **Not access control**: its children are in the DOM all along; see the
security notes, and hide it until hydrated with `idg-session-guard:not(.hydrated)`.

### `idg-user-menu`

An avatar button (part `trigger`, an `idg-button` holding an `idg-avatar`, named "Account menu
for {name}") that opens an `idg-menu` with a group "Signed in as {name}", the page's items (slot
`items`, whose choices reach the page as `idgSelect`) and "Sign out". Props `client`,
`displayName` (the username by default), `avatarSrc`, `labels`. Event `idgSignedOut` with the
outcome: `signed-out` and `superseded` (another tab's newer sign-in stands; not an error) are
announced politely, and `server-unreachable` is shown as a warning (part `outcome`) that says the
session may stay active on the server. Slot `signed-out` while nobody is signed in. It goes when
another tab signs out. After its own sign-out, focus moves to the warning (read as it takes focus,
not said again by a live role); or else to the first element of the `signed-out` slot when that
takes focus as it is, with the outcome said politely; or else to a hidden anchor of the menu's own,
whose text says the outcome as it takes focus. It writes no `tabindex` on the page's elements and
adds no group to the accessibility tree.

## Consent

Two elements put the consent API of the tracker of `@identgineer/tracking` on a page: a banner
that asks once, and a panel where the visitor changes or withdraws the choice. Each takes the
tracker's consent object, `tracker.consent`, as a JavaScript property, `consent`, typed by a local
structural interface (`ConsentClient`, with `ConsentStatusView`, `ConsentStateView`,
`ConsentSignal` and `ConsentChangeDetail`, exported as types). The elements never create a
tracker, never import the tracking package (it is a devDependency, for tests and the type check
only; `checks/` holds that no shipped source, declaration or bundle carries it, nor its fakes) and
store nothing: the tracker keeps the one record. Without a consent object both draw nothing and
log nothing. An object assigned late or swapped is followed and the old one unsubscribed; so is
every object when the element leaves the page, and an element moved in the page subscribes once.
A consent object whose methods throw, or that cannot store the choice, gives an inline `idg-alert`
and never an exception.

Guides: [plain HTML](../../docs/consent/plain-html.md), [React](../../docs/consent/react.md),
[Vue](../../docs/consent/vue.md), [Angular](../../docs/consent/angular.md), and
[the rules the banner follows and why](../../docs/consent/rules.md), which also covers placement,
localisation and what the site owner remains responsible for (their own legal assessment).

### `idg-consent-banner`

A `region` named "Analytics choice" (not a dialog): nothing behind it is inert, no focus is
trapped and it takes none when it appears. It asks only while the state is `unknown` and no
browser privacy signal is set. Under Global Privacy Control or Do Not Track it does not ask: it
draws nothing, or, with `announce-signal`, one polite line (part `signal-note`) that the signal is
respected and analytics are off. The choices are "Decline", "Accept analytics" (the same
variant, size and look, in a row that shares its width equally or one to a line; Decline first in
the DOM and the Tab order) and "Choose". No control closes it, and Escape or ignoring it means no
consent. After a choice, focus goes back to the element that had it before the banner, else to
the page's `<main>` (given `tabindex="-1"` only while it has focus), and a polite live region
(part `status`) says "Analytics accepted." or "Analytics declined.".

Props `consent`, `labels` (`ConsentBannerLabels`, every string, partial objects merged over the
English defaults), `placement` (`bottom`, `top`, `inline`), `announce-signal`, `preferences` (the
id of an `idg-consent-preferences` that "Choose" opens). Events `idgConsentChange` (`{ state }`,
after a choice made here only; subscribe to `consent.onChange` for every change) and
`idgConsentChoose` (cancelable; unless prevented, "Choose" opens the panel named by `preferences`
or slotted as `slot="preferences"`, which a non-modal panel draws only then). Slots `message`,
`policy`, `preferences`; parts `banner`, `message`, `choices`, `decline`, `accept`, `choose`,
`preferences`, `error`, `signal-note`, `status`.

**Placement.** `bottom` makes the host `position: sticky` to the bottom edge, so it keeps its place
in the page's flow and never covers the end of the page: put it last in its parent, with no
`overflow` between it and the page. While drawn and sticking, it keeps the root's
`scroll-padding-block-end` as tall as itself, added to the page's own value (stylesheet or inline)
and given back exactly after, so a focused element is scrolled clear of it (WCAG 2.4.11). A bar
holds to half the window and scrolls inside itself, and in a window under 32rem tall it joins the
page's flow instead. `top` and `inline` are in the flow where the element is (a top bar goes first
in the body and scrolls away, so it never covers a sticky header). The padding is set through the
root's style object, which the strict policy allows.

### `idg-consent-preferences`

A `section` named by its heading (`heading-level`, 2 to 6, default 2) with two rows: "Necessary",
the words "Always on" with no control, and its explanation (the SDK does not track it), and "Analytics",
an `idg-switch` that shows the current state and is off when nothing was chosen. Nothing changes
until "Save preferences" (part `save`), which calls `grant()` or `deny()`; "Withdraw consent and
erase" (part `erase`) asks inline (part `confirm`, never `window.confirm`) and calls `reset()`.
While a signal is set the switch is off and disabled, a note names the signal (part `signal`),
and saving can only record a denial. It follows changes made elsewhere through `onChange`: if the
stored state changes under an unsaved edit, the edit is dropped and a note says so (part
`changed`). The time of the choice, `decidedAt` in the status (milliseconds, `null` if none), is
shown (part `decided`), formatted with `Intl.DateTimeFormat` in the language of the nearest `lang`,
looked for through shadow roots.

`modal` draws it in an `idg-dialog` (which holds and restores focus and closes on Escape,
dropping an unsaved edit, which the live region says politely); `open()` (resolves `true`, or
`false` without a consent object) and `close()` control the dialog. Not modal, `open()` moves
focus to the heading and `close()` does nothing. A successful save or erase in a dialog closes it
and is said politely (part `status`). Props `consent`, `labels` (`ConsentPreferencesLabels`),
`modal`, `heading-level`. Event `idgConsentChange` (`{ state }`, after a save or an erase made
here). Parts `panel`, `heading`, `categories`, `necessary`, `analytics`, `signal`, `decided`,
`changed`, `error`, `actions`, `save`, `erase`, `confirm`, `status`.

## Dashboard

Four elements draw a dashboard of tracked events: `idg-property-picker`, `idg-stat` (above) with
`idg-sparkline` in its `chart` slot, and `idg-event-table`. They are presentational: they take
their data as properties, never fetch and store nothing. The page asks a `DashboardSource`
(`src/dashboard/dashboard-types.ts`: `listProperties()`, `listEvents(propertyId, { page, pageSize,
sort })` and `summary(propertyId, range)`) and hands the answers over. That interface is the typed
seam the server task implements over the authenticated API; **ownership is the source's to
enforce**, and a property the user does not own is answered exactly as one that does not exist
(`DashboardError` `not-found`). `validatedSource(source)` wraps any source so that every request
and answer is checked against the contract (`parseTrackedProperties`, `parseTrackedEvents`,
`parseEventPage`, `parseStatSummary` are exported) and a failure that is not a `DashboardError` becomes one (`unavailable`, without its message).
`src/testing/fake-dashboard-source.ts` is a fake that enforces the same ownership rule; it is not
part of `dist`.

Everything in an event or property is untrusted text. The elements draw it as text only (no
`innerHTML`, no value ever becomes a link or style), replace control, bidirectional, invisible and
lone-surrogate characters with a visible mark, isolate it in `<bdi>`, and cut it to a fixed length.

Guides: [plain HTML](../../docs/dashboard/plain-html.md), [React](../../docs/dashboard/react.md),
[Vue](../../docs/dashboard/vue.md), [Angular](../../docs/dashboard/angular.md), and
[what the source must enforce and how text is treated](../../docs/dashboard/rules.md).

### `idg-property-picker`

A form-associated select of the user's properties, in an `idg-field`. Props `name`, `properties`
(`TrackedProperty[]`; malformed or repeated records are dropped), `value` (the chosen id; an id
that is not in the list selects nothing), `label`, `labels` (`PropertyPickerLabels`: `label`,
`placeholder`, `loading`, `empty`), `loading`, `disabled`. A disabled prompt option is always first.
Each option reads `name · host`. Event `idgChange` (`{ value }`). Method `setFocus()`. Parts
`field`, `select`, `status`.

### `idg-sparkline`

A small line of a series, as one image. Props `values` (numbers, or a string of comma-separated
numbers; non-finite values are dropped and a long series is thinned to at most 120 points that
keep its extremes), `label`, `area` (fill under the line) and `labels` (`SparklineLabels`). Its
accessible name is the label and a sentence: first, last, lowest, highest and the trend. It draws
with the `accent-indicator` role, never animates and is `--idg-size-xs` wide by default (never wider than its container). Parts `chart`, `area`, `line`, `end`.

### `idg-event-table`

A table of events in an `idg-table`, with a status region and an `idg-pagination`. Props `events`
(`TrackedEvent[]`), `caption`, `loading`, `error`, `page` (from 1), `pageSize` (default 10, at most
100), `total` (server mode: events are drawn as given, with no sorting or paging of their own),
`sortable`, `sortKey` (`time` or `name`), `sortDirection`, `timeZone` (an IANA zone) and `labels`
(`EventTableLabels`). Without `total` the table sorts and pages the events it has. The time is shown
with its zone name. `page` follows the pages there are (a page past the last becomes the last, with
no event; nothing changes while `loading`, on error or before events are given). While `loading`
after rows were shown, the table and pager stay (dimmed, `aria-busy`, presses ignored) so focus
stays; a first load is a skeleton, and an error replaces the rows and takes focus. Events
`idgPageChange` (`{ page }`, cancelable) and `idgSort` (`{ key, direction }`). Columns are Event
(the row header), Time (a `<time>`), Path and Properties (at most ten, then "+N more"). Parts
`group`, `caption`, `table`, `status`, `pagination`.

## Brand

Four elements show a brand from `@identgineer/brand`: `idg-brand-logo` draws its logo or mark,
`idg-brand-swatches` its colours, `idg-brand-guidelines` a guide to one kit and `idg-brand-export`
its stylesheet and tokens as text to copy or save. They take the brand package's own data as
properties, fetch nothing and store nothing. None re-derives anything the package decided; the
swatches add only the contrast ratios, which no theme carries. A fifth, `idg-brand-editor`, edits
one kit and saves it through a store the page hands it.

```ts
import { generateBrandTheme, parseBrandKit } from "@identgineer/brand";

const kit = parseBrandKit(stored).kit; // after checking `ok`
logo.logo = kit.logo; // the SVG text exactly as the sanitiser returned it
logo.name = kit.name;
swatches.theme = generateBrandTheme(kit); // or its `document`
```

### `idg-brand-logo`

| Prop         | Attribute    | Notes                                                                               | Default |
| ------------ | ------------ | ----------------------------------------------------------------------------------- | ------- |
| `logo`       | `logo`       | the kit's `logo` or `mark`: SVG text exactly as `sanitiseSvgLogo` returned it       |         |
| `name`       | `name`       | the brand's name: the image's alt, and what is shown without a logo                 |         |
| `variant`    | `variant`    | `logo` (a wide logo, or the name as a wordmark) or `mark` (a symbol, or a monogram) | `logo`  |
| `size`       | `size`       | `xs`, `sm`, `md`, `lg`, `xl`: the logo's height, the mark's edge and the text size  | `md`    |
| `decorative` | `decorative` | an empty alt, for a logo beside the same name written out as text                   | `false` |

No events and no slots. Parts: `image`, `wordmark`, `monogram`. The sizes are the heights `1.25`,
`1.75`, `2.5`, `3.5` and `5rem`; set the width with the page's own CSS on the element (it is
`inline-flex`, never wider than its container).

- **Only sanitiser output is drawn.** The text goes through `logoImage` of `@identgineer/brand/logo`,
  which reads it with the sanitiser again (once, or twice for a logo made with a custom id prefix) and accepts it only if it comes back unchanged.
  Then, and only then, it gives the data URL that is the `src` of an `<img>`, and the size the logo
  draws at. A script, a handler,
  an external reference, a `foreignObject`, an editor's file, an SVG the sanitiser would still change
  and anything wrapped around a logo is never drawn, and neither is any part of it put in the page:
  no SVG element, no `innerHTML`, no `style`. The check runs when `logo` changes, not on every
  render. Measured in Node, one read takes 0.25 to 1.9 ms for the fourteen logos from design tools
  in the brand package's clean fixtures (250 to 2465 bytes), and about 0.65 s for a 480 KB logo of
  tiny shapes, near the size limit.
- **Image only.** The `<img>` has `decoding="async"`, no `srcset`, `sizes`, `crossorigin` or `usemap`,
  and a data URL, so it makes no request. Its `width` and `height` are the logo's natural size, the
  root's `width` and `height` in pixels (what the sanitiser settled, not the view box, which a root
  of `width="3in" height="1in"` or one with a padded view box does not match), scaled to whole
  numbers that keep its shape, because the attributes are whole numbers. Its height is set by
  `size`, so the box has its final shape before anything is decoded: nothing shifts when it loads. It is drawn whole (`object-fit: contain`), and in a container
  narrower than the logo the box shrinks, never stretching or cropping it.
- **Content-Security-Policy.** A data URL needs `img-src data:`. The strict policy the components are
  tested under (`default-src 'self'`) does not allow it, so allow it as the brand package says:
  `img-src 'self' data:`. Where the browser refuses the image, or it fails to decode, the component
  shows the name in its place.
- **Fallback.** With no logo, or one that is not drawn, `variant="logo"` shows the name as a
  wordmark (text in the theme's display face) and `variant="mark"` a monogram: the first letter of
  the first and last word in a box with the accent fill and `on-accent` text. With no name as well
  it draws nothing. The name is cut at 60 characters (the kit's limit) and bidirectional and other
  invisible characters in it are replaced by a visible mark.
- **Accessible name.** The image's `alt` is the name (never the logo's own `title`); `decorative`
  makes it empty. A wordmark is text, so it is its own name (`aria-hidden` when `decorative`); a
  monogram is a `role="img"` named for the brand, with its letters hidden.

### `idg-brand-swatches`

| Prop     | Attribute | Notes                                                                                   | Default |
| -------- | --------- | --------------------------------------------------------------------------------------- | ------- |
| `theme`  |           | a theme from `generateBrandTheme`, or its `document`; set as a property, it is data     |         |
| `label`  | `label`   | the accessible name of the whole                                                        |         |
| `labels` |           | `BrandSwatchesLabels`: scheme and group names, the contrast sentence, the empty message | English |

No events and no slots. Parts: `swatches`, `scheme`, `scheme-title`, `group-title`, `swatch`, `chip`,
`role`, `value`, `pairs`, `empty`. The `label` names a group; each scheme (light, dark) is a named
group of four lists (page, text, accent, status), one list item per role, so a screen reader
announces the scheme, the group and the position.

- **Every value is text.** Each item holds the role's name, its value (`#4f46e5`) and, for a
  foreground colour, a line per background it is used on: `4.62:1 on bg passes 4.5:1`, or
  `needs 4.5:1` where it is below its WCAG level (4.5 for text, 3 for the other parts of the
  interface). The ratio is rounded down to two decimals, so a ratio under its minimum is never
  written as meeting it, and is formatted in the language of the page. The chip is decoration
  (`aria-hidden`); colour is never the only carrier.
- **The pairs are the theme's.** They are every pair the tokens package requires of a theme
  (`CONTRAST_PAIRS`, which a test holds this table to) and the others the brand generator meets for
  text and accent; each is measured with the tokens package's `contrastRatio`.
- **Only validated colours reach the page.** A role's value is shown only if it is exactly the
  package's own format, `#rrggbb` in lower case, and the roles are the fixed list of the theme, never
  a key the data brings. Anything else (a named colour, `rgb()`, `var()`, a declaration after a
  colour, markup, a number) leaves that role out, and nothing of it is drawn. The chip's colour is
  set as one custom property through the style API, never a `style` string or CSS text, which the
  strict policy would not allow either. With nothing valid at all, the `empty` message is shown.
- **Chips stay visible.** Each chip has a 2px edge in `border-strong`. The browser tests measure
  that edge against the surface behind the chip, composited as the page draws it (the scheme's own
  fill, translucent in the glass design, over the page), in all eight designs and both schemes, and
  hold it to 3:1, so a colour as light as the page or as dark as the dark scheme is still a shape. Forced colours keep the chip's own colour with a system edge.
- **No movement.** It has no transition or animation, so reduced motion changes nothing; it has no
  focusable element, so nothing is in the tab order.
- **The axes.** Each scheme is a surface of the page's design (its fill, border, corners, blur and
  elevation), the chips take the design's corners and elevation, the number of swatches in a row
  follows the layout (`--idg-layout-grid-min`), the text follows the UX mode's scale, and the
  schemes sit side by side only where there is room. At 320px, and at 200% zoom or text, it reflows
  to one column without sideways scrolling.
- The brand gradient is not drawn by the swatches; `idg-brand-guidelines` shows it.

### `idg-brand-guidelines`

A guide to one brand: its name and tagline, its logo and mark on a light and a dark backing, its
colours (`idg-brand-swatches` inside), the gradient, a type specimen, the corner radii, the tone, and
the notes and adjustments the generator made, written as sentences.

| Prop           | Attribute       | Notes                                                                                                      | Default |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| `kit`          |                 | a kit from `parseBrandKit`; set as a property, it is data                                                  |         |
| `theme`        |                 | the theme `generateBrandTheme` made for it (or its `document`)                                             |         |
| `label`        | `label`         | the accessible name of the whole                                                                           |         |
| `labels`       |                 | `BrandGuidelinesLabels`: every heading, caption and sentence                                               | English |
| `swatchLabels` |                 | `Partial<BrandSwatchesLabels>`, passed to the swatches                                                     | English |
| `headingLevel` | `heading-level` | the level of the name, 1 to 5 (6 gives 5); the sections are one level deeper, or at its level with no name | `2`     |

No events and no slots. Parts: `guidelines`, `heading`, `tagline`, `section`, `section-title`,
`exhibit`, `caption`, `note`, `tone`, `empty`. The kit and theme types are declared here
(`BrandGuidelinesKit`, `BrandGuidelinesTheme`) and a type test holds `BrandKit` and `BrandTheme` to
them.

- **Everything from the kit or theme is untrusted.** Text is set as text; nothing is `innerHTML` or
  a style string. A colour is used only after an exact `#rrggbb` match (the kit's source colours as
  three whole channels), a radius, gradient position or ratio only after finite and range checks, and
  the font pairing, corners and tone only as ids of the brand package's own presets
  (`@identgineer/brand/presets`). Values reach the page as custom properties through the style API.
- **Malformed parts are left out, never thrown on.** A kit or theme that is a proxy, has a getter
  that throws or holds the wrong types loses that section (or that item), and the rest is shown. With
  nothing valid, the `empty` message is shown. Each read is an own-property read inside a `try`.
- **Logos.** The logo and mark are drawn by `idg-brand-logo` on a tile of the brand's own page
  colour, with its text and accent, for each scheme; the name stands in where an image is missing or
  refused. A data URL image needs `img-src 'self' data:` as for `idg-brand-logo`.
  The sanitiser reads a logo once for each distinct text, however many tiles and guides show it:
  the answers for the last four texts (two guides' logo and mark) are kept, none for a text past
  the sanitiser's 512 KB limit, so at most about 8 MB is held. A guide's own kit change costs one
  read for each new text, about half a second for a logo of 440 KB.
- **Headings.** The name is the heading at `headingLevel`, each section one level below it, so a page
  chooses where the guide sits in its outline.
- **Reflow.** Nothing is wider than its host at 320px or at 200% text.

### `idg-brand-export`

Shows a theme's stylesheet and its design tokens as text, each in a labelled, focusable, scrollable
region, with Copy and Download buttons, and a snippet for loading the theme.

| Prop           | Attribute       | Notes                                                                                       | Default |
| -------------- | --------------- | ------------------------------------------------------------------------------------------- | ------- |
| `css`          |                 | the stylesheet text, as `emitBrandThemeCss` returned it                                     |         |
| `tokens`       |                 | the tokens text, as `emitBrandThemeTokens` returned it                                      |         |
| `theme`        |                 | a theme from `generateBrandTheme`: emitted in the browser for what `css` and `tokens` leave |         |
| `themeId`      | `theme-id`      | the theme's id for the snippet, used only for a stylesheet given as `css`                   |         |
| `name`         | `name`          | the brand's name, which the file names are made from; defaults to the theme's kit           |         |
| `label`        | `label`         | the accessible name of the whole                                                            |         |
| `labels`       |                 | `BrandExportLabels`: headings, hints, buttons and the messages that follow an action        | English |
| `headingLevel` | `heading-level` | the level of each artefact's heading, 1 to 6                                                | `2`     |

**Events:** `idgCopy` and `idgDownload`, each with `{ artefact }` (`css`, `tokens` or `snippet`).
**Parts:** `export`, `artefact`, `title`, `hint`, `code`, `actions`, `status`, `problem`, `empty`.

- **Text only.** Each artefact is a `<pre><code>` set as text, in a region named by its heading that
  is in the tab order, so a keyboard user can scroll it. Texts over 256 KB (262,144 characters;
  a theme emits a few KB) are dropped. A string given as `css` or `tokens` wins over what `theme` would give.
  The snippet names the theme the stylesheet shown defines: the id the emitters scoped an emitted
  stylesheet to (the theme is read once, so both texts come from the same reading), or `themeId`
  for a stylesheet given as text, and no snippet where there is none.
- **Copy** writes to the clipboard through the clipboard API inside the click, and says so. Where
  the API is missing or refuses, the text is selected, the region focused, and the status says that
  it is selected and must be copied by hand. A copy event fires only on success.
- **Download** makes a `Blob` with an explicit type (`text/css`, `application/json`), a hidden
  `<a download>` pointing at its object URL, clicks it, and revokes the URL a second later. The file
  name is a slug of the name of lower case letters, digits and hyphens, at most 40 characters, with
  `brand` when nothing is left (a Windows device name falls back too). The result is announced.
- **The snippet** (two `<link>` lines and the `data-theme` attribute) is built only from the
  validated theme id (letters, digits and hyphens), and only shown where a file exists to load.
- **Status.** One polite live region (`role="status"`, `aria-live="polite"`, `aria-atomic`) with the
  same two alternating slots as the variation switcher, so the same message twice is announced twice.
- **Emitting in the browser works.** `@identgineer/brand/emit` bundles the generator, the sanitiser
  and the tokens emitter, which read no disk (the token sources are JSON imported at build time). The
  emitters regenerate from the theme's kit and refuse a theme changed after it was generated, so a
  tampered theme shows a problem message and no file. Output is byte for byte what Node emits
  (a browser test compares them).
- **Content-Security-Policy.** No directive is added. A blob download through `<a download>` and
  `navigator.clipboard.writeText` in a click are allowed by `default-src 'self'; style-src 'self';
script-src 'self'; require-trusted-types-for 'script'`, and a browser test runs the whole
  element under it with no violation and no request off the origin. Reading the clipboard back in a
  test needs the `clipboard-read` permission, which is not a policy matter.
- A downloadable, self-contained HTML guide is not part of this element. It is later work.

### `idg-brand-editor`

A form for one brand kit with a live preview: the name, tagline and theme id; the primary and
secondary colours and the neutral tint, each a hex field with a native colour picker inside it,
kept in step; the font pairing, corners and tone from the brand package's presets; and the logo and
mark as SVG uploads, each with a remove button. The preview is `idg-brand-guidelines`.

```ts
import { createBrandKitStore } from "@identgineer/brand";

// The store the brand package makes, or anything with its create and update.
editor.store = createBrandKitStore({ baseUrl, fetch: identity.authorizedFetch });
editor.documentId = record.documentId; // to update a stored kit; leave it out to create one
editor.kit = record.kit; // untrusted, as the store returned it
editor.addEventListener("idgSave", (event) => {
  // event.detail: { documentId, id, created }
});
```

| Prop           | Attribute       | Notes                                                                                         | Default     |
| -------------- | --------------- | --------------------------------------------------------------------------------------------- | ----------- |
| `kit`          |                 | the kit to start from; untrusted. Setting it again starts over                                |             |
| `store`        |                 | `{ create(kit), update(documentId, kit) }`, which the object `createBrandKitStore` fits       |             |
| `documentId`   | `document-id`   | the stored kit's id: saving updates it. Without one the first save creates, later ones update |             |
| `label`        | `label`         | the accessible name of the form                                                               | `Brand kit` |
| `labels`       |                 | `Partial<BrandEditorLabels>`: every word, including one message per error code                | English     |
| `headingLevel` | `heading-level` | the level of the preview's heading, 1 to 6; the guide starts one level deeper                 | `2`         |
| `preview`      | `preview`       | whether the preview is shown                                                                  | `true`      |

**Events:** `idgSave` after a save, with `{ documentId, id, created }` and nothing of the kit.
**Parts:** `form`, `error`, `saved`, `fieldset`, `image`, `removals`, `submit`, `preview`. No slots.

- **It saves only through `store`.** The element never creates a store, never fetches and keeps
  nothing in browser storage; the draft lives in the element. A save calls `create`, or `update`
  with the document id it was given or the one its first save returned. The button shows `loading`
  only while the store has not answered, and a second submit then does nothing. A save while a
  logo or mark is being read waits, busy (a second submit does nothing), until no read is pending,
  keeping for each image the latest thing that happened to it during the wait (refused, removed or
  accepted), which a new read of that image clears. If any image's latest is a refusal it stops,
  keeping the refusal on the field, showing the summary and focusing the first such upload; else
  if any image's latest is a removal it stops quietly; else it saves the form as it stands, text
  edited meanwhile included. Replacing the kit or taking the element off the page also stops it
  without saving. The confirmation goes as soon
  as the form changes, and a change made while the store answered is not in what was stored, so
  the confirmation then says so (`savedBefore`) and keeps the removals of an image that was not
  sent. A store that throws
  or rejects gives an alert, never an exception, and an answer that is not a stored record says the
  kit was sent but the answer could not be read. A refusal that the store reports as an error with
  a `BrandKitStoreError` code is one fixed message per code (`saveUnauthorized` to
  `saveUnexpectedStatus`, and `saveUnknown` for anything else); `validation` and `not-applied` mark
  the fields the server named (its field names mapped to the form's) with fixed words. Nothing the
  server said is shown.
- **Which kit a save changes, and `created`.** A create that stored a kit but did not report it
  whole (a `not-applied` error with a `documentId`, or an `{ ok: false, documentId }` answer that
  could not be read back) still stored that kit: the next save updates it rather than creating
  another. `created` is `true` on the first `idgSave` for a kit this editor created, whether the
  create itself or a later update is the first save to succeed, and `false` on every other.
- **Validation is `parseBrandKit`'s.** Each of its codes is one fixed message on the field it names,
  through `idg-field` with `aria-invalid`. On a save with fields to change, a summary alert is shown
  and focus goes to the first of them. Nothing is checked twice in another way.
- **Uploads.** A file is refused by its size against `SVG_LOGO_LIMITS.inputBytes` before a byte is
  read, whatever its name or type says; then it is read as bytes and passed to `sanitiseSvgLogo`,
  and only the sanitiser's output is kept, previewed and saved. A refused file shows one fixed
  message per code on its field and the previous logo stays. What the sanitiser removed is listed
  (`removals`) before the kit is saved; saving keeps the cleaned file, or the remove button drops
  it. A read overtaken by a later upload or remove is dropped, as is any read that ends after the
  element left the page. A kit's own logo is shown only if it is exactly the sanitiser's output;
  otherwise it is left out and the field says so.
- **Untrusted text stays text.** The kit's values are read as own properties, and set as input
  values and text. Raw SVG never reaches the DOM, an attribute, a URL or an event: the logos are
  drawn by `idg-brand-logo` from the sanitised text.
- **The preview** runs `parseBrandKit` and `generateBrandTheme` once typing pauses (300 ms after
  the last change), not on every keystroke; an upload or remove updates the logos at once without
  working the theme out again. While the draft is invalid the last valid version stays, and says
  so. The guide is inside the element's shadow root, so the brand's colours style nothing outside
  it.
- **Narrow forms.** The form is a container: below 20em (at 320px, or with large text) its groups
  and hex boxes pad less, and each hex field keeps at least 8ch for a whole `#rrggbb`, wrapping
  below its picker inside the box, with the invalid mark inside it too. The file chooser's button
  sits on a line of its own above the file name, wrapping its label, so no upload clips it. A
  browser test checks this in every layout at 320px and at 200% text.
- **Control names** are the fields' names prefixed with `brand-` (`brand-name`, `brand-id`, …): a
  control named `id` or `name` would shadow the form's own properties.
- **Content-Security-Policy:** the logos are data URL images, so as for `idg-brand-logo` the page
  needs `img-src 'self' data:`. Nothing else is added, and a browser test runs the editor under
  that policy with no violation and no request off the origin.
- It loads `@identgineer/brand/edit` (the parser, the generator and the sanitiser), not the
  package's index: no store code and no emitter are in its bundle.

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
- A brand's logo is a data URL image, which this policy refuses. `idg-brand-logo` is tested under
  the policy with `img-src 'self' data:` added (the one directive the brand package asks for), and
  under this one, where it shows the name instead. The test server gives that policy to the demo
  index page, which shows two logos, the guide and the editor, and to no other page. `idg-brand-export` draws no
  image and is tested under the strict policy itself.
- The custom-elements build was not loaded under the CSP: it needs a bundler, and runs the same
  runtime.

Component sources are scanned by `checks/` for `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`document.write`, `eval`, `new Function`, string event handlers and inline style strings, and the
stylesheets for hex, `rgb()`, `hsl()` and similar colour literals and raw `ms` or `s` durations. The
layout primitives' stylesheets are held to more. Each of these is refused:

- a length with a unit, signed or not, in any unit (`px`, `rem`, `em`, `ex`, `ch`, `ic`, `lh`,
  `cap`, `rex`, `rch`, `ric`, `rlh`, the viewport units including `vi`, `vb` and the `sv*`, `lv*`
  and `dv*` families, and the container units `cq*`), in a declaration or in the prelude of an
  `@container` or `@media` rule; every size is a token. A plain zero is allowed, and a number
  written with an exponent is refused whatever it works out to;
- a physical property such as `margin-left` or `width`;
- `left` or `right`, in any case, as the value of `text-align`, `justify-content`,
  `justify-items`, `justify-self`, `align-content`, `place-items`, `place-content`, `place-self`,
  `float` or `clear` (`inline-start` and `inline-end` are allowed);
- three or four values in `margin`, `padding`, `inset`, `border-width`, `border-style`,
  `border-color`, `scroll-margin` or `scroll-padding`, and more than one value in `border-radius`,
  because those are ordered by physical side or corner;
- the same for shapes, in `clip-path` and `shape-outside`: `rect()` and `xywh()`, and an `inset()`
  with more than two sides or more than one radius after `round`; and the legacy `clip` property;
- two values in `overflow`, which are ordered x then y;
- a viewport media query, which includes `@media (orientation: ...)`; a container query may use
  `orientation`.

`!important` is not counted as a value of the declaration it ends, and strings and comments are not
read as css.

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
  layout primitives' wrapping, column counts and right-to-left placement, on pages in `fixtures/` (outside `src`, so they never reach the dist collection; `button.html`, `forms.html`, `surfaces.html`, `overlays.html`, `navigation.html`, `layout-primitives.html`, `layout-shell.html`, `variation-switcher.html`, `identity.html`, `brand.html`, `brand-export.html`, `brand-editor.html`; copied to `www/fixtures/`; static HTML, no inline
  script or style). Build first. Playwright's own Chromium is installed with
  `pnpm --filter @identgineer/components exec playwright install --with-deps chromium`; where that is
  not possible, set `IDG_CHROMIUM_PATH` to a Chromium binary (`/opt/pw-browsers/chromium` is used if it
  exists). `IDG_BROWSER_PORT` changes the port (4173). Only Chromium is run.
- **Variations in the build.** `@identgineer/variations` is TypeScript source with `.ts` import
  specifiers. Stencil only compiles its own `src`, so `stencil.config.ts` carries a small rollup
  plugin that transpiles that package's files (and nothing else), and `tsconfig.json` allows `.ts`
  import specifiers for the type check while `tsconfig.build.json` turns that off again, which
  emit requires. The `variation-switcher.html` fixture loads the bootstrap script from
  `/variations/bootstrap.js`, which the www build copies from `packages/variations/dist` (that
  package builds first, since this one depends on it). The fixture's `integrity` attribute is
  written out, and `checks/fixture-bootstrap.test.ts` fails when it no longer matches what the
  package builds: copy the new value from `dist/bootstrap.sri.json`. The same plugin transpiles the
  brand and tokens packages, which the brand components import. They import only the narrow entries
  made for a browser bundle, `@identgineer/brand/logo` (`isSanitisedSvgLogo`, `logoDataUrl` and `logoImage`),
  `@identgineer/brand/presets` (the corner, tone, radius and font-pairing tables),
  `@identgineer/brand/emit` (`emitBrandThemeCss` and `emitBrandThemeTokens`),
  `@identgineer/brand/edit` (`parseBrandKit`, `generateBrandTheme` and `sanitiseSvgLogo`, for the
  editor) and `@identgineer/tokens/contrast` (`contrastRatio`), because the packages' indexes also load the
  rest of the pipeline. Import-graph tests hold each entry to loading no Node built-in.
- **Bundles.** Left to itself, Stencil groups components that share imports, and the logo
  sanitiser, the theme generator and the emitters ended up in the one bundle of `idg-button` and 44
  others: `www/build` held it as a 450,181 byte entry (325,993 before the brand components) and
  `dist/esm/idg-accordion_47.entry.js` was 846 KB (633 KB before). Listing components in `bundles`
  in `stencil.config.ts` turns that grouping off, and a component not listed becomes a bundle of its
  own; one bundle for each component was tried first and made a composite wait a round trip for
  what it creates when it renders (the dashboard's rows were in the page after 35 ms and seen after
  230 to 320 ms at 100 ms latency, and the index page went from 16 to 72 requests). So the
  components are grouped by what renders or is used together, and each brand component is apart.
  A component is in one bundle only, so the leaves most families use (and `idg-skeleton` and
  `idg-switch`, which the profile renders) are in
  `controls`, which a composite of another group waits one round trip for unless the page has
  asked for it already. `controls` has no chunk of its own: the five small helpers its components
  share with other groups (`oneOf`, `initials`, `safeUrl`, `linkRel`, `validityFlags`) are copied
  in `src/utils/controls-copies.ts`, held to the originals by a test, because a module shared by
  two entries goes into a chunk that is fetched only after the first entry arrives (a second
  round trip, for 250 bytes). Its entry imports only the core chunk every entry imports.
  A page with only `idg-brand-guidelines` waits one hop for the logo and the swatches bundles
  that the guide renders (by design: a component is in one bundle only, and the guide's own
  entry is the one that creates them). A page with only `idg-brand-editor` waits one hop for the
  forms, logo and guide bundles it renders, fetched in parallel, and a second for the swatches the
  guide renders; `checks/core-bundle.test.ts` lists each of these as an accepted render.
  `stencil-bundles.ts` lists the groups, and `stencil.config.ts` and
  `checks/core-bundle.test.ts` both read it. The check holds this layout from the sources and the
  build: every component is in exactly one group; what a component renders (through the files it
  imports) is in its own group or in `controls`, apart from listed exceptions with their
  reason; no group but the brand ones loads the sanitiser, generator or emitters (and the brand
  closures do hold them, so the check cannot pass for want of a string); `controls` imports only
  chunks that every entry imports; and each group stays within a ceiling of its measured size.
  What a page loads of a group, its entry and the chunks it
  imports, in bytes:

  | Group                  | Components                                                                                                                                                   | `www/build` | `dist/esm` |
  | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------: | ---------: |
  | controls               | icon, button, link, badge, progress, alert, avatar, avatar-group, skeleton, switch                                                                           |      57,977 |    117,342 |
  | forms and identity     | field, input, textarea, checkbox, radio, radio-group, select, sign-in, register, password-reset, profile, session-guard, property-picker, variation-switcher |     153,913 |    309,785 |
  | dashboard              | event-table, table, pagination, stat, sparkline                                                                                                              |      67,796 |    168,578 |
  | consent and overlays   | consent-banner, consent-preferences, dialog, popover, tooltip, toast, toast-region                                                                           |      87,918 |    188,483 |
  | menus                  | menu, menu-group, menu-item, menu-separator, user-menu                                                                                                       |      49,796 |    126,820 |
  | tabs                   | tabs, tab, tab-panel                                                                                                                                         |      31,746 |     87,726 |
  | accordion              | accordion, accordion-item                                                                                                                                    |      27,957 |     79,096 |
  | layout                 | stack, cluster, grid, cover, sidebar, switcher, layout, divider, card, breadcrumb, breadcrumb-item                                                           |      84,127 |    161,055 |
  | `idg-brand-logo`       | the logo, with the sanitiser                                                                                                                                 |     117,086 |    327,029 |
  | `idg-brand-swatches`   | the swatches                                                                                                                                                 |      29,826 |     84,500 |
  | `idg-brand-guidelines` | the guide, with the sanitiser                                                                                                                                |     141,319 |    375,430 |
  | `idg-brand-export`     | the export, with the sanitiser, the generator and the emitters                                                                                               |     219,466 |    500,751 |
  | `idg-brand-editor`     | the editor, with the sanitiser and the generator, and the guide it previews in                                                                               |     246,360 |    549,309 |

  The loader `identgineer.esm.js` is 12,922 bytes more on every page. The sanitiser (about 90 KB
  minified) is in the logo's, the guide's, the export's and the editor's bundles (the export
  validates a kit with it), the generator in the export's and the editor's, and the emitters in the
  export's alone. The editor's row counts its own entry and chunks; a page with it also loads the
  forms, logo, guide and swatches groups it renders. The whole `www/build` directory is 698,376
  bytes (663,801 before the editor), against 433,865 before the brand components and 536,437 on
  main.

  Measured against main's grouped build, with 100 ms of latency and 1.5 MB/s (median of five
  runs, fully hydrated): a page with only an `idg-button` in 509 ms (925 ms on main), loading
  70,516 bytes in 4 requests (363,999 bytes in 13); the navigation fixture in 820 ms (937 ms), 21
  requests of 199,900 bytes (13 of 363,999); the demo index page, which now also shows the guide,
  the export and the logos, in 1,134 ms (902 ms) with 37 requests of 645,974 bytes (16 of
  370,939); and the dashboard fixture in 934 ms (855 ms), 21 requests of 308,832 bytes (18 of
  384,535), the extra time being its forms and variation tools asking for `controls` once they
  render. Moving `idg-skeleton` and `idg-switch` into `controls`, and giving `controls` its own
  helper copies, made the button page 100 ms faster (one round trip fewer) and the dashboard 100
  ms faster than before (1,033 ms, 23 requests) and left the index page where it was (1,147 ms).
  Its rows are in the page and
  seen in the same frame (0 ms apart, where one bundle per component left 200 ms).

- **The identity fixture.** `identity.html` wires every identity element to one real client on the
  identity package's fake API (`createFakeIdentityApi`), in the page. The build's second step,
  `scripts/build-sdk-fixtures.ts`, transpiles that package's source and its fake into
  same-origin modules in `www/identity-sdk/`, so the fixture runs under the strict policy; they are
  never part of `dist`, which `checks/shipped-bundle.test.ts` holds. `?confirm` turns email
  confirmation on and `?hold-restore` keeps the first restore unanswered until the test lets it go.
  The identity browser tests (`identity*.browser.ts`) cover autofill hints on the real inputs,
  keyboard and focus, enumeration parity, the throttle countdown, cross-tab sign-out, no browser
  storage writes, axe across every axis, right to left, and 200% text at 320px in every UX mode
  (no sideways scroll, no reveal button past its field, no word broken in a squeezed line), and
  each UX mode's own inline padding at 320 to 1280px with normal text. Each identity element is an
  inline-size container; only when it is narrower than nine of its own ems (large text on a narrow
  screen) do its controls' inline padding (at most `4cqi`) and its gaps shrink. The primitives'
  own padding is never capped.
- **The consent fixture.** `consent.html` wires both consent elements to one real tracker from
  the tracking package, in the page: the same build step writes the tracker and its fakes to
  `www/tracking-sdk/` (also never part of `dist`). The tracker really posts to `/collect`, which
  the browser tests answer themselves, so every request is seen at the network level (`?fake-collector`
  uses the SDK's fake collector instead). `?granted` and `?denied` stand for an earlier visit and
  `?announce` sets `announce-signal`; a test sets Global Privacy Control or Do Not Track with an
  init script. The consent browser tests (`consent*.browser.ts`) cover zero requests before Accept,
  after Decline and under a signal, keyboard-only flows, focus, two tabs, the bar's place and
  scroll padding, axe across every axis, equal prominence of Accept and Decline as numbers (same
  variant, same computed look, size within a pixel) in every design, right to left, forced
  colours, reduced motion, and 200% text at 320px in every UX mode.
- **The dashboard fixture.** `dashboard.html` wires the picker, stats, sparklines and event table to
  the fake source, built into `www/dashboard-sdk/` by the same step as the other SDK fixtures
  (never part of `dist`). `?hostile` adds a property whose strings are hostile, `?none` has no
  properties, `?hold` keeps every answer back until the test releases it, `?fail-events` and
  `?fail-properties` make the first call fail, `?events=N`, `?page-size=N`, `?property=ID`, `?lang=`
  and `?dir=` set the data and the page. The dashboard browser tests (`dashboard*.browser.ts`)
  cover ownership at the source, stale answers, hostile text, keyboard and focus,
  axe across every axis, right to left, forced colours, reduced motion, and 200% text at 320px in
  every UX mode.
- **The brand fixture.** `brand.html` shows both brand elements. The logos and the generated
  themes (a kit with a logo and a mark, a kit with a white primary, and a theme whose colours are
  hostile text) come from `brand-data.json`, which `browser/brand-page.ts` generates with the brand
  package and answers at the network level, so the page cannot be opened without the test. The
  helper serves the page with the strict policy plus `img-src 'self' data:` (or with the strict
  policy alone), records every request and every `securitypolicyviolation`, and refuses any other
  origin. The brand browser tests (`brand-logo.browser.ts`, `brand-swatches.browser.ts`) cover no
  violation and no request beyond the page's own files, a hostile logo never drawn and never run,
  the size of the image before it decodes and no layout shift, the logo's proportions at every
  size, accessible names read from the accessibility tree, the refused data URL under the plain
  strict policy, contrast of the wordmark and monogram in all 8 themes in light and dark, the
  swatches' values and ratios against the theme, the chip edges at 3:1 on the page in all 8
  themes in light and dark, axe across the 8 designs in light and dark, the 8 UX modes and the 8
  themes, a design signature of its own in each of the 8 designs, the layout's column counts, no
  motion, and no sideways scroll at 320px in every layout at 100%, 125% and wide text, and at 200%.
- `src/testing/` holds spec helpers (a recording `ElementInternals`, since the mock DOM has none) and
  is excluded from the Stencil build.
- `tsconfig.json` is the strict config for tooling and editors. `tsconfig.build.json` is the one
  Stencil reads: it turns on emit and turns off `verbatimModuleSyntax`, which Stencil's decorator
  transform cannot work with. `exactOptionalPropertyTypes` is off in both because Stencil's JSX
  attribute types do not accept an explicit `undefined`.
- `src/components.d.ts` is generated by Stencil and committed.
