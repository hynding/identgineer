# @identgineer/brand

Brand identity: a brand kit (name, colours, a font pairing, corners and tone) turned into a
complete colour theme for your own project. A generated theme is one more value of `data-theme`,
next to the eight built-in themes of [`@identgineer/tokens`](../tokens/README.md), and is held to
the same checks they are.

Pure TypeScript: no DOM, no network, no dependency besides `@identgineer/tokens`. It runs in Node
and in browsers. A kit can also carry a logo and a mark, as SVG that has been through the
[logo sanitiser](#logos).

## Use

```ts
import {
  emitBrandThemeCss,
  emitBrandThemeTokens,
  generateBrandTheme,
  parseBrandKit,
} from "@identgineer/brand";

const result = parseBrandKit(JSON.parse(body)); // untrusted input: a form, a request, a file
if (!result.ok) return respond(422, result.errors); // [{ path: "colors.primary", code, message }]

const theme = generateBrandTheme(result.kit);
const css = emitBrandThemeCss(theme); // write it to themes/acme.css, after the tokens stylesheet
const tokens = emitBrandThemeTokens(theme); // the same theme as a DTCG theme source
theme.adjustments; // every colour the generator had to move, for the brand guide
```

Serve the CSS after the tokens stylesheet and set the id like any theme:

```html
<link rel="stylesheet" href="/tokens/index.css" />
<link rel="stylesheet" href="/themes/acme.css" />
<html data-theme="acme" data-scheme="dark">
  …
</html>
```

The variations runtime only accepts theme ids it knows. Register the generated id before applying
it (see [Generated themes](../variations/README.md#generated-themes)):

```ts
import { applyVariations, isVariationId, registerThemeIds } from "@identgineer/variations";

registerThemeIds([theme.id]);
if (isVariationId("theme", theme.id)) applyVariations({ theme: theme.id });
```

## The brand kit

`parseBrandKit(input: unknown)` returns `{ ok: true, kit }` or `{ ok: false, errors }`, each error
naming its field (`path`), a `code` and a message that never repeats the refused value. It never
throws, also not on a throwing getter or a revoked proxy. Only a plain object (or one without a
prototype) is a kit; a Map, a Date or a class instance is refused at the root. At most 50 errors are
listed, followed by one `too-many-errors` entry. Lengths are counted in code points.

| Field                | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | The `data-theme` value, by the tokens package's added theme id rule: 2 to 32 lower-case letters and digits in words joined by single hyphens, starting with a letter; not a built-in id of any axis, a CSS-wide keyword, `default`, `none`, `auto`, `system`, `light`, `dark`, `brand`, `theme`, `custom`, `constructor` or `prototype` (`RESERVED_BRAND_IDS`, which is `RESERVED_THEME_IDS`)                                                                                                                               |
| `name`               | 1 to 60 characters: letters, marks (at most four non-spacing or enclosing marks in a row, joiners between them included) and digits of any script, single inner spaces (never two in a row), `. , ' ’ & ! ? -`, the Hebrew geresh and gershayim (`׳ ״`) after a letter or mark, the middle dots `·` and `・` between two letters, never repeated, and a zero-width non-joiner or joiner between two letters or marks (as Persian and Sinhala need); other format characters, bidirectional controls among them, are refused |
| `tagline` (optional) | The same, up to 120 characters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `colors.primary`     | `#rgb` or `#rrggbb`, either case                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `colors.secondary`   | Optional, the same                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `colors.neutralTint` | Optional, the same: its hue tints backgrounds, text and borders                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `typography`         | One of `TYPOGRAPHY_IDS`: `system`, `geometric`, `humanist`, `grotesque`, `classic-serif`, `book`, `technical`                                                                                                                                                                                                                                                                                                                                                                                                               |
| `corners`            | `sharp`, `soft` or `round`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `tone`               | `calm`, `balanced` or `vivid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `logo` (optional)    | An SVG exactly as `sanitiseSvgLogo` returned it (see [Logos](#logos)): one the sanitiser refuses is `invalid-logo`, with its reason and line; one it would still change (an editor's file, or a hostile one) is `unsanitised-logo`                                                                                                                                                                                                                                                                                          |
| `mark` (optional)    | The same, for the compact symbol (a favicon, an avatar)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Unknown keys are refused at every level, `__proto__`, `constructor` and `prototype` included.
Colours are kept as numbers (`kit.colors.primary` is `[79, 70, 229]`); no colour string survives
parsing. Only hex is accepted: `rgb()`, `hsl()`, `oklch()` and named colours are refused, which
keeps the parser small and the surface narrow.

Each font pairing (`FONT_PAIRINGS`) is a display, body and mono stack built only from fonts that
ship with common operating systems and ending in a generic family, so nothing is fetched. A kit
names a pairing; it can never give a font-family string of its own.

## How a theme is generated

`generateBrandTheme(kit)` works in OKLCH, a perceptual space, with conversions to and from sRGB
implemented here (Björn Ottosson's OKLab, tested against reference values). For each scheme it
sets the neutrals at fixed lightness levels, tinted with the hue of the neutral tint or the
primary at a chroma set by the tone (none for a grey). Every foreground role then starts from a
colour of its own and, if it fails, moves in lightness only, away from its backgrounds, until it
passes: a search over OKLCH lightness at constant hue (a bisection, or a scan for the band that
passes when both ends fail), each candidate gamut-mapped back to sRGB by reducing chroma alone and
judged after rounding to 8 bits, so it passes exactly as tested.

The requirements are the tokens package's `CONTRAST_PAIRS`, read at run time, plus every pairing
the components draw that all eight built-in themes meet, each at its WCAG level:

| Role                        | Also on                                                   | Level |
| --------------------------- | --------------------------------------------------------- | ----- |
| `text`                      | `bg-subtle`, `accent-subtle` (and 7:1 on every surface)   | 4.5:1 |
| `text-muted`                | `bg-subtle`, `surface-raised`, `accent-subtle`            | 4.5:1 |
| `link`                      | `bg-subtle`, `surface`, `surface-raised`, `accent-subtle` | 4.5:1 |
| `on-accent-subtle`          | `bg`, `bg-subtle`, `surface`, `surface-raised`            | 4.5:1 |
| `focus-ring`                | `bg-subtle`, `surface`, `surface-raised`, `accent-subtle` | 3:1   |
| `border-strong`             | `surface`, `surface-raised`                               | 3:1   |
| `danger`, `success`, `info` | `bg`, `bg-subtle`, `surface`, `surface-raised`            | 3:1   |

The status fills in the last row mark state on the page (an error border, a success icon), so
they must stand out from every page background as well as carry their own text. `warning` is left
out of that row because the built-in themes do not give amber 3:1 on a light page either; danger
used as text is likewise only required at 3:1, as in the built-ins.

The primary is always the accent fill, exactly as given: light yellows, amber, white and
near-black keep their colour. The fill carries a text label, so the page does not constrain it,
only its text. That text is white or a near-black tinted with the primary's hue, whichever reads
better; for the 5.6% of colours on which neither reaches 4.5:1 (mid-tones such as `#777777`;
1,123 of 20,000 seeded random kits), it is pure black, and since white or black reaches 4.5:1 on
any colour, the fill never has to move.

The page constrains the two roles that need it, both held to 3:1 on `bg`, `bg-subtle`, `surface`
and `surface-raised`:

- `accent-indicator`, the accent as a mark of state or selection (a checked box, a switch, a
  progress fill, the current page), with `on-accent-indicator` at 4.5:1 on it. It is also held to
  3:1 on `accent-subtle`, the tint behind the current navigation item that its marker sits on; the
  indicator moves for that and the tint stays, so the brand's subtle wash is untouched;
- `accent-border`, the edge of an accent fill where the fill alone cannot be told apart.

Where the accent already reaches 3:1 on all four (and, for the indicator, on `accent-subtle`)
they are the accent's own colours (and
`on-accent-indicator` is `on-accent`), as in the built-in themes. Otherwise each moves from the
accent in lightness only, keeping its hue, and is reported.

The hover state follows the built-in themes: one hover step further from the page (darker in
light, lighter in dark). Where the text on it would fail there, or the accent is already at the
end of its range, it steps towards the page instead. One of the two always moves away from the
text, so the text keeps passing and the hover always differs from the accent. Links and the focus
ring start from the primary (the focus ring from the secondary when there is one) and move only if
they must. Status colours start from fixed hues (green, amber, red, blue). Tone scales the chroma
of tints, neutrals and status colours, and how far text and strong borders sit from the page; it
never changes the accent.

The gradient starts at the primary exactly as given. It ends at the secondary or, without one, at
an analogous hue: the primary turned 30° or 40°, either way, at its lightness and mapped into
sRGB. Only turns at least 0.08 from the primary in OKLab count, so the two ends can be told apart.
Of those, a hue outside the olive band (OKLCH hue 95° to 135° below lightness 0.85, where green and
amber would otherwise turn muddy) is preferred, and among the rest the one that keeps the most
chroma wins: green ends at teal, amber at coral, indigo at violet. A grey primary, or one with no
turn far enough from it (a near-black such as `#111827`), turns in lightness instead, towards the
middle by at least 0.12 and until the ends differ by 1.5:1, so even black gets a visible gradient.

Every move is reported in `theme.adjustments`: scheme, token, origin (`primary`, `secondary` or
`generated`), requested and used colour, the background that bound the move, the threshold, and
the contrast before and after.

`theme.notes` lists what passes but a brand guide should know about. There are two kinds.
`status-near-accent`: a status colour whose OKLab distance from the accent is below
`STATUS_NEAR_ACCENT` (0.08), so that a red brand's danger, or a green brand's success, reads like
the accent. The status keeps its fixed hue (moving it would make it a worse status colour); the
note names the scheme, the status token, the accent and the distance, so you can pair the status
with an icon or label, or choose a primary further from it.

`accent-blends-with-page`: the accent is below `ACCENT_BLENDS_WITH_PAGE` (1.5:1) against `bg` in
a scheme, as white is in light, near-black in dark and a pale yellow such as `#facc15` in light.
The fill is kept, and the components give a primary button a 2px edge in the theme's
`accent-edge`, but the button then reads as primary by its edge alone; the note gives the scheme
and the contrast, so the brand guide can say so or pick a primary for that scheme's buttons.

The theme comes back as `theme.document`, a DTCG theme source in exactly the shape of the
built-in ones (`common` typography, `light` and `dark` colour and gradient, label and
description), so the tokens package parses, verifies and emits it unchanged.

## Guarantees

Tested on every run:

- **Total.** Every kit `parseBrandKit` accepts gives a theme: white, black, greys, fully saturated
  colours, identical and near-identical primary and secondary all do.
- **Passing.** Every generated theme defines every theme-owned role in both schemes and nothing
  else (`findThemeProblems`), passes the whole contrast suite in both schemes
  (`findContrastFailures`) and meets every pairing in the table above, checked with the tokens
  package's own functions over 2,700 seeded random colour sets and twenty edge sets, for every
  tone and corner style. That includes `accent-indicator` and `accent-border` at 3:1 on `bg`,
  `bg-subtle`, `surface` and `surface-raised` in each scheme, and the indicator on `accent-subtle`
  too, both equal to the accent wherever the accent itself reaches that, and a hover that differs from the accent.
- **The brand's own fill.** The accent is the primary unchanged, in both schemes, for every kit.
- **Recognisable.** The primary is used unchanged unless a move is reported; a moved brand colour
  keeps its hue within 3° while it still has colour (OKLCH chroma of at least 0.04; about 2.4° at
  most over 20,000 random sets, up to 5° for near-greys whose hue barely shows); a moved colour stops
  within 12% of the threshold that bound it.
- **Deterministic in one engine.** The same kit gives byte-identical output in the same JavaScript
  engine, and golden files hold two sample kits. The colour maths uses `Math.cbrt` and `**`, which
  the language does not require to be correctly rounded, so another engine could in principle
  round a colour on the other side of an 8-bit step. The output is still valid there (every
  colour is checked after rounding), but it is not promised to be byte-identical across engines.
  Generate once, on the server, and serve the result.

## Emission

`emitBrandThemeCss(theme)` writes the theme through the tokens package's own theme emitter, so it
is scoped exactly like a built-in theme file: `[data-theme="<id>"]` for light, `[data-scheme="dark"]`
for forced dark, and the `prefers-color-scheme: dark` rule for a page without `data-scheme`. It
never answers to a bare `:root`; only the default theme does. Like the built-in theme files, each scheme also
carries the derived `accent-edge` (see the [tokens README](../tokens/README.md#accent-fills-and-indicators)):
the accent border where the accent does not stand out on the page, `transparent` where it does.

The corners are a preference, not an override. A separate rule in the `idg.brand` cascade layer
sets `--idg-brand-radius-sm|md|lg|pill` on the element carrying `data-theme`. Radii belong to the
design language: a design that declares `followsBrandCorners: true` (flat, elevated, glass,
outline, soft) resolves each `--idg-shape-radius-*` as `var(--idg-brand-radius-*, <its own value>)`,
so it takes the brand's corners; a design whose identity is its corners declares `false`
(brutalist, editorial, pixel) and keeps its own whatever the brand says. See
[Brand corners](../tokens/README.md#brand-corners). As with any theme, put `data-design` on the
same element as `data-theme` or on a descendant of it. The preference inherits like any custom property: a built-in theme
nested inside a brand-themed ancestor does not set it, so designs that follow brand corners still
take the brand's corners there.

`emitBrandThemeTokens(theme)` writes `theme.document` as formatted JSON, with `<`, `>`, `&`, U+2028
and U+2029 escaped so it is safe inside an HTML `<script>` element. In the JSON the corners and the
kit's choices are under `$extensions.identgineer.brand`, which the tokens pipeline ignores.

## Security

Colour and font inputs only ever become CSS custom property values, never raw CSS:

- Every emitted value is built from parsed numbers or allowlisted constants: hex colours written
  from numbers, font stacks from `FONT_PAIRINGS`, radii from the corner table, typography values
  from the pairing. No input string reaches the CSS.
- The id passes the slug rule and is then written as an escaped CSS string in the attribute
  selector. The name and tagline never reach the CSS; in the JSON they are escaped as above.
- `generateBrandTheme` and both emitters re-validate the kit, reading a kit built or altered by
  hand once and working only from the frozen copy that reading produced, so a getter cannot pass
  validation and then change, and the emitters regenerate the theme from its kit and refuse one
  whose document or radii were changed after generation.
- The tests feed CSS injection, markup, `url(javascript:…)`, `expression(…)`, `@import`,
  backslash and Unicode escapes, newlines, NULs, bidirectional controls, lone surrogates, very
  long strings and prototype keys to every field and check that parsing refuses them; for valid
  kits, a strict reader of the emitted grammar checks that the CSS holds exactly the expected custom
  properties under the expected selectors and nothing else.

## Logos

A brand's logo and mark are SVG files from the brand's owner: untrusted input that a browser will
draw, and that can carry script, event handlers, links, external loads and denial of service.
`sanitiseSvgLogo` turns an upload into a small, canonical, inert SVG or refuses it:

```ts
import { logoDataUrl, parseBrandKit, sanitiseSvgLogo } from "@identgineer/brand";

const upload = sanitiseSvgLogo(bytes); // a string, or bytes that must be UTF-8
if (!upload.ok) return respond(422, upload.errors); // [{ code: "doctype", message, line, column }]
upload.removed; // what was dropped and why, to show the owner: [{ element, attribute, reason, line, column }]

const result = parseBrandKit({ ...kitFields, logo: upload.svg }); // stored exactly as returned
if (result.ok && result.kit.logo) image.src = logoDataUrl(result.kit.logo);
```

`sanitiseSvgLogo(input, { idPrefix })` never throws, whatever it is handed: bytes are measured
and copied through the language's own typed array getters (`byteLength`, `buffer`, `byteOffset`),
never through anything a subclass or proxy overrides, so a `length` that lies or throws changes
nothing; anything that is not a string or a `Uint8Array`, a proxy or revoked proxy included, is
`wrong-type`; and the options are read once, an `idPrefix` getter that throws or a revoked proxy
being `invalid-option`. It returns `{ ok: true, svg, width, height,
viewBox, drawingCost, overdraw, removed, removedCount }` or `{ ok: false, errors }`, with one located error
whose message never repeats the input. Before it is returned, every output is checked: the
independent checker (below) must find nothing in it, and sanitising it again must give it back
unchanged. One that fails, which only a defect in the sanitiser could give, is refused as
`internal-error` rather than accepted; the check about doubles the time (the costliest file in
the corpora, 164 ms). `svg` is a `SanitisedSvg`, a string branded for the type checker, so a
plain string cannot reach `logoDataUrl` or a kit by accident; `isSanitisedSvgLogo(value)` checks
any value at run time (it is a fixed point of the sanitiser), and `logoDataUrl` and `parseBrandKit`
both do.

### How it works

Nothing from the input is passed through. A strict reader written for this package (no DOM, no
`DOMParser`, no XML library, so Node and every browser give the same answer) reads the text into a
tree; namespaces are resolved by the rules of Namespaces in XML; every element and attribute is
held to the allowlist and every value to a grammar of its own, which parses it into numbers and
keywords; references between elements are checked; and the SVG is written again from that tree.
The output is always the same for the same input, has the SVG namespace on the root and nowhere
else, attributes in a fixed order, numbers in one form, ids renamed, no comments, no declaration,
no white space between elements and every character of text escaped. Sanitising it again returns
it unchanged, and it reads back through the same reader without loss.

### Refuse or drop

The rule: **anything that makes the document ambiguous is refused; anything that is merely not
allowed is dropped and reported.**

Refused, as the whole document (each with its own `code`):

- anything the strict reader does not understand: a `DOCTYPE` with an internal subset (so no
  entity declarations, no billion laughs, no external entities), and any `DOCTYPE` that is not
  exactly `<!DOCTYPE name>` with an optional `SYSTEM "…"` or `PUBLIC "…" "…"` before the root (one
  after the root, a second one, one in lower case, or an identifier holding `<`, `>`, `[` or `]`);
  a processing instruction (an `xml-stylesheet` included) other than a leading XML declaration,
  which must say version 1.0 and, if it names one, encoding UTF-8; an entity other than
  `&lt; &gt; &amp; &quot; &apos;` (with or without a `DOCTYPE`, which is never read); a
  character reference that is malformed, longer than 7 decimal or 6 hex digits, or names a
  character not allowed; a bare `&` or `<`; `]]>` in text; CDATA outside the root; an unclosed,
  mismatched or second root element; an unquoted, valueless or repeated attribute (also the same
  attribute through two prefixes, and `href` with `xlink:href`); attributes not separated by white
  space; a name outside ASCII or with more than one colon; a comment holding `--`, ending in `-` or
  starting with `>` or `->` (which HTML would close at once);
- text that is not UTF-8 (UTF-16 with either byte order mark, invalid UTF-8 bytes) and any
  character that is not allowed, written or as a reference: NUL and the other C0 controls but tab,
  line feed and carriage return, DEL and the C1 controls, an unpaired surrogate, U+FFFE and U+FFFF,
  the bidirectional embedding, override and isolate controls, and a byte order mark anywhere but at
  the very start (one there is removed);
- a namespace declaration XML forbids (rebinding `xml` or `xmlns`, an empty prefix binding), an
  undeclared prefix, and a root that is not `svg` in the SVG namespace;
- duplicate ids, a reference cycle (a `use` of itself or an ancestor, gradients that inherit from
  each other, a clip path or mask that uses itself), and a root with no size (neither a view box
  nor a width and height in absolute units);
- what the sanitiser deliberately does not support, since no rewrite of it is sure to show no
  more than the original (`unsupported-feature`, with a message saying what to change; a brand kit
  passes it on): a clip path that must be written as a mask on a root that has a mask of its own; a
  clip path in object-bounding-box units that must be written as a mask and has a transform or clip
  path of its own; a stretching `preserveAspectRatio="none"` (one the view box fitted into its frame would not show
  to within the half device pixel below, so it must be clipped to its view box) beside a clip path
  or mask on the root; a width or height under one CSS pixel (to within a billionth, so
  `0.264583333333mm` is one pixel), given in any unit or worked out from the view box (no logo has
  a natural size that small, and there six decimals are a large share of it; a known limit is
  that a logo with no width or height and a view box under one unit on a side, such as
  `0 0 0.5 0.5`, is refused too, and must be given a size of at least a pixel or a larger view
  box); a view box and size that six decimals cannot hold. One rule decides every view box: the
  output draws its view box fitted into its width and height as written, and what that shows must
  have every edge within half a device pixel (at 4000 device pixels, 2000 CSS pixels twice as
  dense, along the longer side) of what the original showed when drawn at its exact size (the
  width and height as given, converted from their unit before any rounding, a missing one in the
  view box's proportions): the part a `slice` showed, the whole view box under `none`, or the
  view box fitted into the frame with its alignment. With only one of width and height under
  `none`, Chromium gives the original no proportions of its own and ignores the side given too,
  drawing it at the default natural size of 300 by 150 CSS pixels, but it still shows the whole
  view box, which is all the rule compares; the output is given the other side in the view box's
  proportions. The sanitiser writes the first of these that passes: the view box kept whole; under
  `none`, the view box clipped to itself; for a `slice`, the part it showed, each edge to six
  decimals. Where none passes, the logo is refused. That covers a crop of a view box a few
  thousandths of a unit across, whose far edges take two roundings; ordinary logos are far from
  it. The position of a `use` moved onto a group
  (below) is refused unless six decimals hold it exactly; a cropping `slice` beside any length taken as a percentage of
  the view box in what is drawn (a size, position, radius or stroke width of a shape, a `use`
  position, the region of a mask in user units, written or by default, which is -10% and 120%, and
  a coordinate of a painted gradient in user units, written, inherited through `href` or by
  default: 100% for a linear gradient's end, 50% for a radial one's centre and radius, with the
  focus following the centre), which the crop would change. Each gradient attribute is resolved
  as Chromium 153 resolves it: its own, else the nearest gradient in its `href` chain that has
  it (units from either kind, a coordinate only from the same kind, past any of the other kind
  between), else the default. Percentages of a box (a gradient or mask region in
  object-bounding-box units) are unchanged by a crop, a length of 0% is 0 of anything, and a
  definition nothing draws is left out before the check; all three are kept. A `slice` crops
  nothing when, by that one rule, the view box kept whole and fitted into the frame shows what it
  showed; it is then dropped, as the default it equals, and nothing is refused. On an
  elongated view box a crop of a fraction of a pixel on the short side is a letterbox many times
  larger on the long one (a wordmark of 20 to 1 whose frame is 0.24% shorter, five device pixels
  at each end), so it is cropped, not dropped;
- going over any limit below.

Dropped (and listed in `removed`, with the element, attribute or style property, a reason and a
line and column): an element not on the allowlist, together with everything inside it (children
are never lifted out of a dropped element); an attribute not on the element's list; a value that
fails its grammar; a `use` or a reference whose target is missing or the wrong kind (a missing
paint server becomes `none`, which is what a browser draws, rather than black); character data
outside `title` and `desc`; a `DOCTYPE` with no internal subset, such as the public SVG 1.1 one
older Illustrator versions write (it is read only to find its end: no DTD is fetched and nothing it
would declare is honoured, so `&nbsp;` is refused with or without it); and what is valid but would
make the logo far costlier to draw than its budgets can see, or that browsers ignore (`render-cost`;
see the table below), and a clip path written as a mask (`rewritten`, see clip paths of more than
one shape, below). What is guaranteed of these two, `render-cost` and `rewritten`, is exactly this:
the output never shows anything the original did not. Each one draws the same picture, or less of
it, or the document is refused; the table below says which, removal by removal. No such promise is
made for the other removals: dropping what is not on the allowlist (`unsupported-element`,
`unsupported-attribute`, `styling`, `filter` and the rest) is reported, and can change the picture
either way, showing what the original hid as well as hiding what it showed. A `mix-blend-mode` that
made a shape vanish, a filter that blanked one, a `.st0{display:none}` rule in a `style` element
and a `transform` on the root (which Chromium applies as a CSS transform of the whole image, so
the content is drawn where it was before the move) are each dropped and listed, and the shapes they
hid or moved are drawn plainly where they stand. Filters, blend modes and classes are still
dropped rather than refused, since editors write them into ordinary logos. So is a value that fails
its grammar (`invalid-value`): Chromium takes a gradient coordinate written but invalid (`fx="abc"`)
as its initial value, which stops it being inherited through `href` or following the centre, while
the sanitiser leaves it out, so the value is inherited or follows as though it had never been written.
So a host should show the
owner the sanitised preview, beside the list of removals, before saving it as their logo. The reasons are `active-content`,
`event-handler`, `external-reference` (only on an attribute that takes a reference: a `url(` in
path data is just an `invalid-value`), `styling`, `editor-metadata`, `text`, `filter`,
`foreign-namespace`, `unsupported-element`, `unsupported-attribute`, `invalid-value`, `misplaced`,
`dangling-reference`, `character-data`, `document-type`, `render-cost` and `rewritten`. Script, handlers and
external references can be dropped rather than refused because the output is built only from what
passed, so it is inert whatever the input tried. The first 100 removals are listed and
`removedCount` counts them all.

### The allowlist

Elements, all in the SVG namespace (a prefix bound to it works; an element in any other namespace
is dropped), and the attributes each keeps besides `id`:

| Element                            | Attributes                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `svg` (the root only)              | `viewBox`, `width`, `height`, `preserveAspectRatio`, presentation                                                                            |
| `g`, `defs`                        | `transform`, presentation                                                                                                                    |
| `path`                             | `d`, `transform`, presentation                                                                                                               |
| `rect`                             | `x`, `y`, `width`, `height`, `rx`, `ry`, `transform`, presentation                                                                           |
| `circle`, `ellipse`                | `cx`, `cy`, `r` / `rx`, `ry`, `transform`, presentation                                                                                      |
| `line`, `polyline`, `polygon`      | `x1`, `y1`, `x2`, `y2` / `points`, `transform`, presentation                                                                                 |
| `use`                              | `href` (or `xlink:href`) to `#id` in the same document, `x`, `y`, `width`, `height`, `transform`, presentation                               |
| `linearGradient`, `radialGradient` | `href` to another gradient, `x1`, `y1`, `x2`, `y2` / `cx`, `cy`, `r`, `fx`, `fy`, `fr`, `gradientUnits`, `gradientTransform`, `spreadMethod` |
| `stop` (in a gradient only)        | `offset`, `stop-color`, `stop-opacity`                                                                                                       |
| `clipPath`                         | `clipPathUnits`, `transform`, presentation but `clip-path` and `mask`; holds only shapes and `use`                                           |
| `mask`                             | `x`, `y`, `width`, `height`, `maskUnits`, `maskContentUnits`, `mask-type`, presentation but `clip-path` and `mask`                           |
| `title`, `desc`                    | none; their text is kept and escaped                                                                                                         |

Presentation attributes: `fill`, `fill-opacity`, `fill-rule`, `stroke`, `stroke-width`,
`stroke-opacity`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`,
`stroke-dashoffset`, `paint-order` (`normal`, or `fill`, `stroke` and `markers` each at most once
in any order, as Inkscape writes it; it changes only which is painted first, so it costs what the
same paint costs in the usual order), `opacity`, `color`, `clip-path`, `clip-rule`, `mask`,
`display`, `visibility`, `shape-rendering`; and, on a `mask`, `mask-type` (`luminance` or `alpha`), which a
`style` attribute may also set, as Figma writes it.

Each value has a grammar: numbers and lengths (`px`, `%`, `mm`, `cm`, `in`, `pt`, `pc`);
colours (`#rgb`, `#rrggbb`, `rgb()`, the CSS named colours, `currentColor`, written back as
`#rrggbb` or the keyword); paint (`none`, a colour or `url(#id)` to a gradient); `clip-path` and
`mask` (`none` or `url(#id)` to a clip path or mask); transform lists (`matrix`, `translate`,
`scale`, `rotate`, `skewX`, `skewY`, at most 16); path data (every command, arc flags included);
points, `viewBox` (positive width and height), `preserveAspectRatio` (an alignment such as
`xMidYMid`, then `meet` or nothing), dash arrays (at most 64
lengths, in absolute units only) and the enumerations. The rule throughout is strictness on
the keep side: a value is kept only in a spelling Chromium has been checked to read the same way,
and anything else is dropped and reported (`invalid-value`), never read leniently into a valid
value. A number must be one Chromium's SVG number reader takes: a point must have a digit after it (`100.` and `1.e2` are no numbers to Chromium, so
they are dropped, not read as 100), its exponent may not pass 38 either way (Chromium's SVG
number reader takes no `0e39`, even as zero, though its CSS reader, which reads the root's width
and height, takes it as zero), and in path data only white space comes between a command
and its first number, with at most one comma between two numbers (a comma before the next
command is taken, as Chromium takes it); a dash array likewise takes at most one comma between
lengths, and a transform list white space with at most one comma between functions, none before
the first or after the last. An `rgb()` colour is separated all by commas or all by white space.
The keywords of attributes that are not CSS properties (`gradientUnits`, `spreadMethod`,
`clipPathUnits`, `maskUnits`, `maskContentUnits`) are taken exactly as written, since Chromium
does not trim them, and so is an `href`, which must be `#` and an id with nothing around it
(Chromium does not resolve `" #a"` in an image); CSS properties and `preserveAspectRatio`,
`offset`, `viewBox` and lengths are trimmed, as Chromium trims them. A root width or height is kept only as a positive number of pixels or in an absolute unit
(`100`, `100px`, `1e2`, `10mm`), and dropped and reported as a percentage, which an image takes as
no size given, so the logo is sized from its view box. Chromium reads anything else there as a CSS
length, so it is refused rather than dropped: zero or less in any unit, or a number that rounds to
zero (`0`, `-1mm`, `0em`, `0e39`, `1e-39`), which Chromium draws at no size, is `missing-size`; a
unit of the viewport (`1vw`), which an image has none of, a unit the sanitiser does not take
(`2em`, which Chromium draws at 32 pixels, or `4Q`), a calculation (`calc(0px)`,
`max(0px,0px)`), a variable or environment value, a keyword (`auto`, `inherit`) or any other
spelling (`10 px`, `5.`) is `unsupported-feature`. Path data outside its grammar is dropped whole, where Chromium would draw it up to
the first error: the output shows less. A browser test draws 45 spellings of a number (signs,
points, exponents, leading zeros, hexadecimal, `Infinity`, `NaN`, stray white space and commas) in
each of a length, a plain number, a transform, a view box, path data, points, a dash array and the
root's width, and 18 spellings of a pair in each list, in the original and the output, and holds
the output to drawing what the original drew. Where the sanitiser shows less than Chromium would,
it says so: a number written with more characters than `numberLength` refuses the logo; a dash
array whose numbers run together without a separator (`1.5.5`, `1+2`) is dropped; and so are
points of an odd count, which Chromium draws up to the last whole pair. A second browser test
holds the keep side to Chromium by generation rather than by list: for every attribute and style
property the allowlist keeps, it writes valid values in a probe where each shows, mutates them at
random (white space of each kind before, after and inside, commas added, doubled and removed,
case, quotes, comments, escapes, exponents, signs, units, trailing junk, nothing at all) and, for
every spelling the sanitiser keeps with nothing reported, requires Chromium to draw the output as
it draws the original, colour for colour, as an image and as a document. In a style it also sets
the declaration among others: marked important or not, beside another of its property (itself
important or not), after comments, and between decoys whose strings, brackets and urls hold a
`;` (each decoy dropped and reported, and nothing else), so the split and the cascade are held to
Chromium's too. It runs six spellings of
each value in CI (`IDG_CONFORMANCE_SPELLINGS` raises it locally). White space inside a value is XML's: space,
tab, line feed and carriage return; a no-break space or a line separator is not white space, and a
value that leans on one is dropped. A reference is only ever to an id in the same document, which
must match `[A-Za-z_][A-Za-z0-9_-]{0,63}` and exist: no URL scheme, no other file, no `data:` URL.

Decisions, with the reason for each:

- **No `script`, `foreignObject`, `image`, `feImage`, `a`, `iframe`, `video`, `audio`, `object`,
  `embed`, `cursor`, animation (`animate`, `set`, `animateTransform`, `animateMotion`,
  `animateColor`, `discard`) or event handler of any casing.** They run code, load other
  resources, navigate or change attributes after the check; SMIL can set `href` or an event
  attribute.
- **No text (`text`, `tspan`, `textPath`).** An image cannot load web fonts, so text in a logo
  draws in whatever font the viewer has; `textPath` adds another reference. Convert text to
  outlines ("Object to Path" in Inkscape, "Create Outlines" in Illustrator) before uploading.
- **No filters.** Filter primitives are a known source of runaway rendering cost (a huge blur, deep
  turbulence) and `feImage` loads other documents; a logo does not need them.
- **No `pattern`, `marker`, `symbol`, `switch`, nested `svg` or `foreignObject`.** Less surface,
  and nothing a logo needs that a group and `use` cannot do.
- **No CSS.** The `style` element and `class` are dropped, with any selector, `@import`,
  `@font-face`, `url()`, `expression()` or `-moz-binding` in them. A `style` attribute is read as
  declarations, each held to the presentation allowlist and the same grammar as the attribute of
  its name (so `fill:url(https://…)` fails like the attribute would), and written out as that
  attribute, overriding it as CSS does; the output never holds a style attribute. The list is
  split as CSS Syntax splits it: comments are skipped, a string in either quote and a bracket
  (`()`, `[]`, `{}` inside one of the others) hold a `;` without ending a declaration, and an
  unquoted `url(` runs to its `)`. Each declaration then stands or falls alone: an unknown property
  (a font, `-inkscape-font-specification`) is dropped and reported, and so is a value outside its
  grammar or holding a comment, quote, escape or bracket the grammar does not take (`fill:/**/red`
  is dropped, not read past). Among declarations of one property the last marked `!important`
  wins, else the last, as the cascade decides. A dropped one CSS may or may not have taken
  (`fill:hsl(…)` is valid CSS the sanitiser does not read, and wins over the attribute;
  `fill:reddish` is not, and leaves it), and may have taken as important where it holds a `!`
  anywhere; so a read declaration is kept only where it wins even with every dropped one taken
  (an important one after them, or any after dropped ones that cannot be important), and otherwise
  the property goes entirely, the presentation attribute of its name included, each reported. An
  alias counts as the property it stands for in this: `-webkit-clip-path` for `clip-path`, and
  `-webkit-mask…` and every `mask-…` but `mask-type` for `mask` (the `mask` attribute sets the
  whole mask shorthand), so one in a style takes the kept `clip-path` or `mask` with it. A dropped
  `color` leaves `currentColor` on the element and inside it to the colour it inherits instead, the
  one case of a drop that recolours what it does not name. A style property Chromium reads as the
  geometry of the element (`x`, `y`, `width`, `height`, `rx`, `ry` on a rectangle; `cx`, `cy`, `r`
  on a circle and `rx`, `ry` on an ellipse; `d` on a path; `x`, `y` on a `use`; `transform`,
  `translate`, `rotate`, `scale` and the `offset-…` properties on anything drawn, on a gradient and
  on a clip path; `transform-origin` where the element has a transform, and `transform-box` where
  it has a `transform` attribute; each checked against Chromium by a browser test, which also checks
  that Chromium reads none of them on a stop or a mask) is never kept, since the sanitiser keeps
  geometry only as attributes, and dropping it alone would draw the element as neither reading
  does: the element is dropped with it, both reported (a gradient dropped so leaves what it painted
  painting nothing); on the root or a clip path, which nothing could stand in for, the logo is
  refused (`unsupported-feature`). Only a list CSS would split by its error recovery
  (an unclosed comment, string, bracket or url, a string across a line, an escape, a stray or
  mismatched closing bracket, a brace or `@` outside every bracket, a declaration that is not
  `name: value`, an unquoted url holding a bracket, quote or inner space) is dropped whole, and
  reported; nothing is put in its place, so like any other drop it may show what it hid. Inkscape writes colours this way, so they
  survive; a logo coloured only by a stylesheet (Illustrator's default "Internal CSS") comes out
  black: export with "Presentation Attributes" instead.
- **A DOCTYPE is skipped only when it has no internal subset.** Older Illustrator files carry the
  public SVG 1.1 one, which declares nothing the reader would use; an internal subset is where
  entities are declared, so a document with one is refused.
- **No `em` or `ex` lengths, no percentage dashes, no `vector-effect`.** Inline, an `em` takes the
  page's font size, and a non-scaling stroke is dashed after the page's transforms, so neither the
  drawing nor what it costs would be the logo's own (see the drawing cost below).
- **A clip path holds shapes and uses of them, and a mask takes no transform, clip path or mask of
  its own.** Browsers leave a group out of a clip path, and apply none of those on a mask, so
  dropping them changes nothing drawn; a mask on a clip path or on what it holds is ignored too
  (Chromium 153.0.8010.12 does not draw it) and dropped as `render-cost`. A clip path on a clip path
  or on what it holds is kept, and the clip path written as a mask (below). A `use` in a clip path
  of anything but a shape is an error in the specification, which makes the clip path invalid;
  Chromium 153.0.8010.12 leaves such a use out and clips to the clip path's other shapes. The
  sanitiser empties the clip path (each child dropped as `misplaced`, a child something else draws
  kept as a definition), so what it clips draws nothing, which is never more than either.
- **Editor metadata goes.** Inkscape, Sodipodi, RDF, Creative Commons, Dublin Core, Adobe, Sketch
  and Serif namespaces and `metadata` are reported as `editor-metadata`; `xml:space`, `version`,
  `baseProfile` and the root's `x` and `y`, which editors also write, are not on the allowlist and
  are reported as `unsupported-attribute`.
- **`xml:base` goes**, so it cannot redirect a fragment reference to another document.
- **Ids are renamed** to `idPrefix` and a number (default `logo-`), in document order, and ids
  nothing refers to are dropped: an inlined logo cannot clobber a page's ids or globals
  (`id="location"`) or collide with another logo's gradient. Give a mark a different prefix if both
  are inlined.
- **An element without a namespace declaration is read as SVG**, as a browser reads inline SVG in
  HTML; an element whose default namespace is changed (to XHTML, MathML, or nothing) is dropped.

### Limits

Each is in `SVG_LOGO_LIMITS`; going over one refuses the document.

| Limit                  | Value         | Why                                                                                     |
| ---------------------- | ------------- | --------------------------------------------------------------------------------------- |
| `inputBytes`           | 512 KiB UTF-8 | Larger than any reasonable logo; checked before anything is read                        |
| `elements`             | 4,096         | Start tags in the input, dropped ones included                                          |
| `depth`                | 32            | Elements open at once; also bounds every walk of the tree                               |
| `attributesPerElement` | 64            | Editors write about 20 on a busy element                                                |
| `attributeValueLength` | 4,096         | One value as written, other than path data                                              |
| `pathDataLength`       | 128 KiB       | One `d` or `points`; traced artwork is long, but not unbounded                          |
| `textLength`           | 2,048         | Code points, as read: one run of text, and a whole `title` or `desc`                    |
| `nameLength`           | 64            | An element or attribute name                                                            |
| `numberLength`         | 32            | One number as written; exponents take at most 3 digits                                  |
| `integerDigits`        | 6             | Every number is below 1,000,000 in magnitude                                            |
| `fractionDigits`       | 6             | Kept after the point, rounded half away from zero (exact, in decimal, never a float)    |
| `gradientStops`        | 64            | Stops in one gradient                                                                   |
| `referenceDepth`       | 8             | References followed in a row (`use`, gradient `href`, `clip-path`, `mask`)              |
| `renderedElements`     | 20,000        | Elements once every `use`, clip path and mask is expanded: the copies a renderer builds |
| `drawingCost`          | 200,000       | What drawing its geometry costs once every reference is expanded; see below             |
| `overdraw`             | 500           | What painting it costs, in images' worth of solid paint; see below                      |
| `maskApplications`     | 128           | Masks and clip paths applied once every reference is expanded                           |
| `maskDepth`            | 4             | Masks and clip paths applied inside one another, in a row (see below)                   |
| `ids`                  | 1,024         | Elements with an id                                                                     |

`maskDepth` counts masks and clip paths applied while drawing another's content: a mask whose
content has an element with a mask, whose content has one in turn, is three deep, and a clip path
written as a mask counts as one. It does not count masks on an element's ancestors: a masked group
in a masked group is two masks applied one after the other, each one deep, and only
`maskApplications` counts them.

"Billion laughs" by `use` (a definition used ten times, each of those ten times, and so on) is
stopped twice over: by `renderedElements`, for the copies a renderer builds, and by `drawingCost`,
for what drawing them takes, which a count of elements cannot bound: a single 120 KB path drawn a
thousand times is only a few thousand elements.

Transforms are composed as the logo is drawn, and refused (`number-out-of-range`) once any entry
of the result passes a million times a million: no logo magnifies further, and below that no
number the budgets work with can overflow, so neither budget can come out as infinite or as not a
number (every limit is also checked so that a total that is not a number is refused, and every
number reported is checked to be finite).

A logo stored by an older version of this package is held to the limits of the version that reads
it: `parseBrandKit` sanitises the stored logo again, so a logo accepted before a limit tightened (or
before a cost was counted) can fail to parse afterwards. That is intended; the owner uploads it
again, or a simpler one.

The reader works in one pass, in time linear in the input, with no recursion over the input and no
regular expression with nested quantifiers on it. The tests read each of 24 adversarial shapes
(comments, unclosed comments, CDATA sections and attributes, character references, a title split
by comments, long path data, deep and unclosed nesting, a long element name, many uses of one
group or of one masked, dashed path) at two sizes, the larger four times the smaller, with the
limits raised so each is read to its end and accepted or refused only there, and hold the larger
to less than eight times as long, the fastest of five runs of each (linear is about four,
quadratic sixteen). Each shape is sized so its smaller run takes about 9 ms or more on an idle laptop
(9 to 110 ms, from 64 KiB to 2 MiB), the larger 35 to 490 ms; a run under 5 ms is counted as
5 ms, so noise in one too short to time cannot fail it. A ratio, unlike a time, holds on a slow or
busy machine. It catches a quadratic stage costly enough to matter at these sizes, as a
deliberately quadratic name reader is; a quadratic stage cheap enough per step, such as a search
back through the input at `indexOf` speed, can stay under the bound (one gave 7.2) and pass. The drawing cost is measured in the same pass over the expanded references,
each element once, so it is linear too. The overdraw walks every instance a renderer would draw,
which `renderedElements` (checked first) bounds, reading each shape's geometry once.

### Drawing cost and overdraw

A logo inside every structural limit could still hang the tab that draws it, in two ways that one
number cannot bound. Its geometry can be costly whatever size it is shown at: the 120 KB path drawn
a thousand times took from 20 to over 40 seconds to its first frame as an image, inline and opened
as a document. And its paint can be costly in proportion to the pixels it covers: 6 KB that fill and
stroke the whole image 5,373 times with a 64-stop translucent radial gradient took 10.6 seconds at
600 CSS pixels, and 231 seconds at 2000 with a device scale factor of 2. So every accepted logo has
two budgets, measured independently over everything it draws once every `use`, mask and clip path
is expanded: a `drawingCost` for its geometry and an `overdraw` for its paint. Over either, it is
refused, with `drawing-too-costly` or `overdraw-too-large`.

#### Drawing cost

`drawingCost` is the sum of the weights below (`SVG_DRAWING_WEIGHTS`), at most 200,000. The unit
is about one stroked straight segment.

| What is drawn                                         | Weight                             |
| ----------------------------------------------------- | ---------------------------------- |
| A line segment (`L`, `H`, `V`, `Z`, a polyline point) | 1                                  |
| A quadratic curve, a cubic curve, an arc              | 6, 10, 14                          |
| A `rect`, a rounded `rect`, a `circle` or `ellipse`   | 4, 44, 40, as their outlines       |
| Any shape, on top of its outline                      | 32                                 |
| Any other element (`g`, `use`, `title`, …)            | 1                                  |
| `opacity` below 1, on any element                     | 50, a layer                        |
| Each application of a mask or clip path               | 200, plus what it holds, each time |
| Each dash                                             | 1                                  |

Definitions (`defs`, gradients, masks and clip paths where they stand) cost nothing until they are
used, and then cost again for every use; a mask inside a mask is applied each time the outer one
is. Masks and clip paths also have limits of their own: 128 applications in all and 4 inside one
another (`too-many-masks`, `masks-too-deep`).

Dashes are counted from geometry: an upper bound of each shape's length in its own user units (a
curve is no longer than the lines through its control points, an arc than its whole ellipse with its
radii scaled up as SVG scales them), divided by the dash period, times the dashes in each repeat
(half the lengths of an even dash array, all of an odd one, which repeats twice over), with a repeat
more for each subpath, which starts the pattern afresh. Since a dash array inherits, through `use`
too, every shape is counted at the shortest period and the most dashes in a repeat anywhere in the
logo. The overdraw counts a stroke's dashes with the same function, so the two cannot disagree.
Dashing happens in the shape's own user space, so no transform changes the count; that is why
`vector-effect` (whose non-scaling stroke is dashed after the transforms), percentage dashes and
`em` and `ex` lengths, all of which depend on the page, are not kept. The cost model reads back only
the units a grammar keeps, and refuses anything else rather than reading it as zero.

The weights were measured in Chromium, drawing at 600 CSS pixels on a loaded four-core machine:
about 10 µs a unit for stroked lines, and the same per unit for curves (a stroked cubic took about
ten times a stroked line, an arc about fourteen), a dash about one stroked line, a full-size mask
1.3 to 1.6 ms. The 32 for each shape covers setting it up, not painting it: what a fill or a stroke
paints is the overdraw's to count. Geometry is weighed the same at every size, and filling is
about a fifth the cost of stroking, so filled art is weighed as if stroked. A real logo is far
below the limit: the logos in the clean corpus cost from 109 to 1,678, under 1% of it.

The limit has little headroom over the busiest real logos: 300 uses of a 60-cubic symbol cost
190,201, 95% of it, yet draw in 9 ms at 600 pixels and 85 ms at 2000 twice as dense, because a
curve weighs ten lines however small it is drawn. Raising the limit is not the fix: the drawing
cost is the only bound on geometry at small sizes, and a wider stroke dashed as finely is what the
overdraw's stroke ends (below) refuse long before this limit. Weighing a curve by its size would make
room; it is left for when a real logo needs it.

#### Overdraw

`overdraw` bounds the pixels a logo paints, and how dear each one is, at most 500
(`SVG_OVERDRAW_WEIGHTS`). The unit is the square on the larger side of the view box painted once in
a solid colour: the whole image, when the logo is shown in a square. Each instance of each shape is
charged on its own, with its own transform and the paint it inherits (from its ancestors, or from
the `use` that draws it):

- **Area.** A fill covers no more than the box of its points (control points included, an arc's
  whole ellipse) and, path by path, no more than the triangles fanned from each subpath's start
  over its control polygon plus each curve's hull. The area is carried through the transform by
  its determinant, and never past the box the transformed box makes. A stroke reaches half its
  width out, up to the miter limit times that at a miter join, and covers no more than its outline
  times its width plus a join or cap at each vertex. Fill and stroke are charged separately, each
  at most the whole image: nothing outside it is painted.
- **Paint.** Each area is weighed by what paints it. Opacity on a shape with one paint is folded
  into that paint; on a shape with two, or on a group or `use`, it takes a layer.
- **Layers, masks and clip paths** are charged over the box of what they apply to, each time they
  are applied, on top of what their content paints (a clip path's content as coverage only).
- **Edges.** Rasterising costs per edge as well as per pixel: a path's edges are charged by their
  length in sides of the image, each segment no more than the image can show (a straight edge its
  diagonal; a quadratic, an arc or a whole shape its perimeter; a cubic three times that), a
  stroke's outline twice over. Edges that cross every row crowd it, and a crowded row costs more
  than in proportion: a path whose edges cross the image `edgesPerRow` times costs twice as much
  per edge, and more beyond.
- **Stroke ends.** Every join and every cap is outline the rasteriser walks, and on a wide stroke
  it is long: a round join or cap is half a circle of the stroke's width, a square cap twice the
  width, a miter join up to the miter limit times it. Each segment is charged a join and each
  piece of the stroke two caps, as edge length in sides of the image (no more than four sides each,
  what the image can show). A dashed stroke has a piece per dash, counted from its length and the
  dash period as for the drawing cost, with an odd dash array counted as repeated; each dash also
  adds its width squared to the area. When the dashes are closer together than the stroke is wide,
  their caps overlap and cross every row, so they crowd it like the edges above.
- **Clip paths.** A clip path is only ever of one shape that is not clipped in turn (any other is
  written as an alpha mask, below, and charged as one), and is charged as a clip over the box of
  what it applies to. A clip path's own `transform` is applied to its content, as browsers do.

| What is painted (once over the whole image)        | 600 px         | 2000 px, ×2      | Weight    |
| -------------------------------------------------- | -------------- | ---------------- | --------- |
| A solid colour                                     | 0.039 ms       | 3.1 ms           | 1         |
| A translucent colour, or opacity on a shape        | 0.08–0.09 ms   | 10.3–10.8 ms     | 4         |
| A gradient of 2, 4, 8 stops, opaque                | 0.39–1.07 ms   | 16–41 ms         | 6–14      |
| A gradient of 16, 32, 64 stops, opaque             | 1.02–1.69 ms   | 43–69 ms         | 15–23     |
| A gradient of 2 to 64 stops, translucent           | 0.48–1.92 ms   | 38–79 ms         | 14–26     |
| Group opacity over two shapes (the layer alone)    | 0.87 ms        | 51 ms            | 16        |
| A luminance mask, an alpha mask                    | 3.0 ms, 1.5 ms | 193 ms, 101 ms   | 64, 32    |
| A clip path                                        | 0.04 ms        | 3.2–3.4 ms       | 1         |
| An edge across the image, filled, stroked, clipped | 47, 6, 54 µs   | 29, 51, 77 µs    | 0.03      |
| 1,500 and 3,000 such edges in one path, each       | 162 and 182 µs | 478 and 1,587 µs | ×4.5, ×15 |

Gradients weigh by their stops, rounded up to the next of 2, 4, 8, 16, 32 and 64, linear and radial
alike (radial measured a little dearer, so both take its figure). Each weight is the larger of what
it measured at the two sizes once the limit is shared out as a second at 600 pixels and 1.75
seconds at 2000 twice as dense, rounded up: 2 ms and 3.5 ms a unit. Paint is dearest at the large
size, edges at the small one. Stops are not limited further than 64: a 64-stop gradient paints
only about a fifth dearer than a 32-stop one, and the weight already charges for it.

A dash costs little while the stroke is no wider than the dash period (100,000 dashes a hundredth
of a unit wide drew in 43 ms at 2000 twice as dense), and a great deal once it is: on a stroke as
wide as the image, 2,000 dashes took 0.25 seconds, 3,000 took 15 and 5,000 took 38, and 3,000 on a
stroke 300 wide took 4.6. 5,000 round dots, subpaths of no length, took 2.4 seconds without any
dash. The stroke ends charge all of these by their outline.

#### Clip paths of more than one shape

A clip path of several shapes clips to their union, and a renderer that works the union out with
path operations can take minutes over it, at no size the budgets can see. A review found two
zigzags of 69 segments, each edge all but on top of the next, at 30,000 in a view box 60,000 wide,
taking 7.8 minutes to their first frame in Chromium; two of 69 a little further apart at 100,000,
22 seconds; one zigzag beside a square, 16.9 seconds; and the time erratic in the number of
segments. An earlier version counted how often the shapes could cross and refused past a limit;
since the time does not follow the count, no limit on it was safe. So no clip path of more than one
shape is kept.

A clip path of more than one shape, or of one shape clipped in turn (a shape or `use` in it with a
clip path of its own, or a `use` of a shape with one), or with a clip path of its own, is written
as an alpha mask (`mask-type="alpha"`) of the same shapes, under the same id, and reported with
the reason `rewritten`. A mask paints its content and never combines it, and its alpha is 1
wherever any shape covers, so it lets through what the clip path let through:

- **Content.** The mask carries the paint every shape inherits: `fill="#ffffff"`,
  `fill-opacity="1"`, `fill-rule="nonzero"`, `stroke="none"`, `visibility="visible"`. Each shape is
  drawn bare: its geometry, its own `transform`, its clip path if it has one, and `fill-rule` only
  where its clip rule is `evenodd` (its own, or the `use`'s, or the clip path's or what holds it,
  as Chromium inherits it); a clip path takes neither its shapes' paint nor their strokes. A `use`
  stays a `use`, with its `x`, `y` (a percentage taken of the view box, in object-bounding-box
  units too, as Chromium takes it), `transform` and clip path, pointing at one bare copy of its
  shape. The copy is made once for the whole document, however many uses draw it, in a `defs` set
  just before the first clip path that needs it, so the output grows with the input rather than
  with the uses. What a clip path ignores is left out (a shape not displayed or hidden, by itself
  or by the `use` that draws it) and dropped as `render-cost`; a child that something else draws
  (a `use` elsewhere naming its id) is kept, with its id, paint and all, in that `defs`. The clip
  path's own `transform` goes on a group around the content, and its own clip path on a group
  around that, since Chromium applies it outside the transform.
- **Clips in turn.** A clip path on a shape, a `use` or the clip path itself keeps working in the
  mask: if it is of one shape it stays a clip path, and if it needs rewriting it becomes a mask in
  turn, nested in this one, counted in `maskDepth` like any other.
- **Units and region.** `clipPathUnits="objectBoundingBox"` becomes
  `maskContentUnits="objectBoundingBox"`, the region staying in the same box; otherwise the
  region is in user space (`maskUnits="userSpaceOnUse"`). The region is the box of every shape
  through its transforms, grown by a tenth of its larger side on each side, so that antialiasing
  at the edge is kept. Nothing outside the shapes is let through by the clip or by the mask, so
  any region holding them draws the same; a region far larger costs no more (Chromium bounds the
  mask by what it masks: 12 masked squares took the same with a region of the view box and of two
  million units). An element with an empty box (a horizontal line, say) draws nothing under a clip
  path or mask in object-bounding-box units, and draws nothing the same way after the rewrite.
  `display` is copied. The region is held within the largest number a value may be (999,999.999999):
  for shapes near that, far from the origin or spanning most of it, the margin gives way first,
  and only shapes reaching past it lose their edges, which shows less, never more.
- **What used it.** Every `clip-path` that named it, written as an attribute or in `style`, in
  the drawing or in a mask's content, becomes `mask`. An element that has a mask of its own moves
  into a group that takes its id, its `transform` and, for a `use`, its `x` and `y` (as a
  translation after the transform, a percentage taken of the view box), and the new mask, so a
  `use` of it, and the space both masks work in, stay as they were. The root's clip path works in
  the space around the root, in CSS pixels, which only a mask on the root shares: one on a root
  without a mask becomes a mask on the root, and one on a root with a mask of its own is refused
  (`unsupported-feature`). The group takes the position only where six decimals hold it exactly (a
  percentage of the view box worked in whole millionths); otherwise the logo is refused
  (`unsupported-feature`), since a rounded position would move what it places.
- **Sharing and budgets.** One mask stands for each clip path, however many elements used it, and
  takes an id from the same counter as everything else, so the output is still a fixed point. A
  rewritten clip path counts as a mask: in `maskApplications`, in `maskDepth` (nested inside any
  mask it is applied within), in the drawing cost (200 an application, plus its shapes) and in the
  overdraw (an alpha mask, 32, over the box of what it masks). The budgets are measured after the
  rewrite, on what is written.
- **Known limitation: refused, not rewritten.** A clip path in object-bounding-box units that
  needs rewriting and has a `transform` or a clip path of its own is refused
  (`unsupported-feature`): Chromium applies those in user space, outside the box its shapes are
  drawn in, which no mask shared by everything the clip path clips can stand for. One of a single
  shape, not clipped in turn, is kept as it is, transform and all.

Before rewriting, every definition nothing drawn refers to, directly or through other definitions
(a clip path, mask or gradient no element uses, a `defs` child no `use` draws), is dropped without
being reported, since it changes nothing drawn; so an unused clip path costs no work and no output,
however many uses of however large a path it holds; a `defs` left empty goes too. Dangling
references are dropped and reported before the sanitiser adds anything with an id, and nothing it
adds takes a name the input defines or refers to, so no reference can come to name what it adds.
The output is never larger than an input may
be (`inputBytes`): one that would be is refused (`too-large`) rather than returned. Nor may it have
more elements, deeper nesting or a longer attribute value than an input may (the clip to a
stretched view box adds three elements, a group taking a mask adds a level, and a number such as
`1e-6` is written out as `0.000001`): those are refused as `too-many-elements`, `too-deep` and
`too-long`. So every output can be sanitised again and gives itself back.

Before and after are drawn as images in the browser test and compared pixel by pixel, for
overlapping circles, compound shapes by the even-odd and the nonzero rule, a clip path with its own
transform, one in object-bounding-box units, uses of shapes with paint and strokes of their own, a
clip under an element's own mask, one on a transformed element drawn again by a `use`, a stroke
reaching far past its shape's box, hidden shapes and a percentage position, one in a mask's
content, a shape clipped in turn, one on the root, a clip child and a hidden clip child drawn by a
`use` elsewhere, a `use` with a position, a mask and a clip path, a percentage position in
object-bounding-box units, a clip path clipped itself under its own transform, a clipped shape and
a clipped `use` (its clip of two shapes) in a clip path, a mask in a clip path, and one shape in
object-bounding-box units with a transform, kept: at most 0.5% of the pixels may differ, by
antialiasing. Every case, and the emptied clip path holding a `use` of a group, is also held to
showing nothing more: at most 0.5% of the pixels may be painted after in a colour that is neither
the original's there nor the transparent background (a check of opacity alone would miss content
shown in place of other opaque content, which a test of the check itself shows). One
departure is Chromium's: with the even-odd rule, a shape with a hole before a shape overlapping it
clips to less than their union, and to the union with the order turned round; the mask draws the
union the specification asks for in either order, which the test checks against Chromium's own
drawing of the turned order.

What each removal for drawing does to the picture, as drawn by Chromium 153.0.8010.12:

| Removed                                                                                            | Reason                                                              | Drawn after                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preserveAspectRatio` `slice` on the root                                                          | `render-cost`                                                       | The same: the view box becomes the part that showed (refused where six decimals cannot hold it, or beside a percentage of the view box); one whose view box kept whole shows the same to half a device pixel just goes |
| `preserveAspectRatio` `none` (stretched) on the root                                               | `render-cost`                                                       | Less: drawn to fit, undistorted, clipped to the view box where fitting it alone would show more; refused then beside a root clip or mask                                                                               |
| An element, attribute or style property not on the allowlist, a class or `style` rule, a filter    | `unsupported-element`, `unsupported-attribute`, `styling`, `filter` | Not promised: reported, and may show what the original hid (a blend mode, filter, `display:none` rule or root `transform` that hid or moved a shape)                                                                   |
| A `style` attribute only CSS error recovery could split (an unclosed comment or string, an escape) | `invalid-value`                                                     | Not promised: reported, and may show what its declarations set or hid                                                                                                                                                  |
| A style declaration outside its grammar, and every other one of its property, attribute included   | `invalid-value`, `external-reference`                               | Not promised: reported; the property takes its default (a paint that referred outside paints nothing)                                                                                                                  |
| An element whose style sets geometry Chromium reads (a width, a transform), with the declaration   | `unsupported-attribute`                                             | Less: the element is not drawn (a gradient paints nothing); the root or a clip path is refused                                                                                                                         |
| `mask` on a clip path or on a shape or `use` in one                                                | `render-cost`                                                       | The same: browsers ignore it                                                                                                                                                                                           |
| `clip-path` of `none` on a clip path or on a shape or `use` in one                                 | `render-cost`                                                       | The same: it is what no clip path is                                                                                                                                                                                   |
| A shape in a clip path not displayed or hidden                                                     | `render-cost`                                                       | The same: the clip path ignores it; kept as a definition where something else draws it                                                                                                                                 |
| A clip path holding a `use` of anything but a shape (each child, `misplaced`)                      | `misplaced`                                                         | Less: the clip path is emptied, so what it clips draws nothing; its own clip path goes too                                                                                                                             |
| A clip path of more than one shape, or clipped in turn or itself                                   | `rewritten`                                                         | The same, but for Chromium's even-odd order quirk above, where the mask draws the full union                                                                                                                           |
| Such a one in object-bounding-box units with its own transform or clip path                        | refused                                                             | `unsupported-feature`                                                                                                                                                                                                  |
| One on a root that has a mask of its own                                                           | refused                                                             | `unsupported-feature`                                                                                                                                                                                                  |

A clip path of one shape that is not clipped in turn is kept, however long or self-crossing: it
clips by its outline, with no union. The browser test times the costliest of each form at both of
the reviewer's offsets (31 uses of a near-coincident zigzag of 6,000 segments at 30,000 and at
100,000, alone, turned by its own transform or the clip path's, through a `use`, by the even-odd
rule; 15 inside another such clip path; and 7 in object-bounding-box units of a unit square drawn
at full size): each took 1 to 3 ms at 600 pixels, 26 to 34 ms at 2000 twice as dense and 32 to 50
ms inline. Applied inside another, the two clips are applied one after the other, never combined
by path operations: two near-coincident clips nested took 1, 30 and 49 ms.

The rewrite costs real logos little: a wordmark of eight outlined letters clipping a gradient, as
Illustrator writes text made into a clip (560 cubics), comes to 3.1% of the drawing cost and 7.7%
of the overdraw, four such in one logo to 12.2% and 30.6%, and thirteen fit before the overdraw
limit (each masks the whole image here; a mask over a smaller box costs less).

#### What each term stands for

Each round of review found work that fell between two terms, so each term was attacked on its own:
for each, the input that does the most real work for what it is charged, made as large as the
limits allow and timed the same way as the table that follows. None comes near a second at 600
pixels; the slowest at 2000 twice as dense is paint, as the overdraw intends.

| Term                                   | The work it stands for                | What does the most work for what it is charged                                              | 600 px     | 2000 px, ×2  | Inline, 600 px |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- | ------------ | -------------- |
| Drawing cost: a line, 1                | walking and stroking a segment        | 19 uses of a path of 10,000 tiny segments, filled and stroked with round joins              | 165 ms     | 1.05 s       | 217 ms         |
| Drawing cost: a curve, 6 to 14         | flattening it into segments           | 9 uses of 2,000 tiny cubics; 7 of 2,000 tiny arcs                                           | 36, 39 ms  | 0.10, 0.28 s | 47, 50 ms      |
| Drawing cost: a shape, 32              | setting a shape up                    | 2,777 tiny circles, filled; stroked                                                         | 5, 5 ms    | 0.03, 0.04 s | 37, 52 ms      |
| Drawing cost: an element, 1            | walking the tree                      | 4,095 empty groups; 4,093 uses of a small square (the element limit)                        | 2, 13 ms   | 0.03, 0.04 s | 32, 71 ms      |
| Drawing cost: a layer, 50              | setting a layer up                    | 2,325 small shapes with opacity on a fill and a stroke                                      | 8 ms       | 0.04 s       | 52 ms          |
| Drawing cost: a mask or clip path, 200 | applying it                           | 128 small shapes each masked; each clipped (the application limit)                          | 3, 8 ms    | 0.03, 0.10 s | 34 ms          |
| Drawing cost: a dash, 1                | starting a dash, its caps             | 190,000 round hairline dashes; 180,000 of 64 lengths                                        | 31, 19 ms  | 0.06, 0.05 s | 151, 112 ms    |
| Overdraw: area by paint                | painting pixels                       | 19 full-size radial gradients of 64 translucent stops, repeating every 0.3% of the image    | 39 ms      | 1.71 s       | 80 ms          |
| Overdraw: layers and masks             | an offscreen surface, and blending it | 131 group opacity layers over small shapes spread across the image                          | 14 ms      | 0.69 s       | 19 ms          |
| Overdraw: edges, crowded rows          | rasterising every edge on every row   | 4,853 long lines in one path; 1,500 edges in an even-odd clip path                          | 73, 316 ms | 0.32, 0.71 s | 93, 127 ms     |
| Overdraw: stroke ends                  | walking the outline of joins and caps | 1,047 butt dashes on a stroke as wide as the image; 875 miter joins at a miter limit of 100 | 319, 4 ms  | 0.12, 0.05 s | 104, 22 ms     |
| Overdraw: clip paths written as masks  | a mask surface, the shapes painted in | 13 clip paths of two near-coincident zigzags of 3,000 segments; 12 of 43 shapes             | 19, 33 ms  | 0.98, 1.66 s | 33, 33 ms      |

The costliest logos the sanitiser accepts of each kind, rasterised in full as an image on that
machine (load average about 8 on four cores, median of three) at 600 CSS pixels and at 2000 with a
device scale factor of 2, and drawn inline at 600 until a screenshot shows it:

| The costliest accepted                                             | `drawingCost` | `overdraw` | 600 px | 2000 px, ×2 | Inline, 600 px |
| ------------------------------------------------------------------ | ------------- | ---------- | ------ | ----------- | -------------- |
| One path of 4,853 long stroked lines                               | 4,886         | 499.9      | 73 ms  | 0.32 s      | 93 ms          |
| One path of 390 wide stroked arcs                                  | 5,493         | 497.6      | 25 ms  | 0.10 s      | 32 ms          |
| 190,000 round-capped hairline dashes                               | 191,801       | 4.1        | 31 ms  | 0.06 s      | 151 ms         |
| 180,000 hairline dashes of 64 lengths                              | 180,757       | 24.0       | 19 ms  | 0.05 s      | 112 ms         |
| 180,000 hairline dashes of two lengths                             | 180,549       | 24.0       | 20 ms  | 0.04 s      | 110 ms         |
| 446 full-size solid fills                                          | 16,503        | 499.5      | 17 ms  | 1.19 s      | 34 ms          |
| 21 full-size 64-stop linear gradients                              | 778           | 485.5      | 34 ms  | 1.41 s      | 42 ms          |
| 19 full-size 64-stop translucent radial gradients                  | 704           | 496.3      | 34 ms  | 1.55 s      | 70 ms          |
| 9 gradient fills under gradient strokes twice the image            | 334           | 476.6      | 33 ms  | 1.48 s      | 96 ms          |
| 29 full-size group opacity layers                                  | 3,597         | 496.5      | 21 ms  | 1.27 s      | 32 ms          |
| Full-size masks four deep                                          | 986           | 261.6      | 17 ms  | 0.82 s      | 53 ms          |
| A clip path of 1,500 crowded edges, even-odd, applied twice        | 3,543         | 412.9      | 316 ms | 0.71 s      | 127 ms         |
| 5,370 radial gradients on a view box 1,000 wide and 1 tall, `meet` | 199,765       | 462.1      | 79 ms  | 0.48 s      | 156 ms         |
| 1,047 butt dashes on a stroke as wide as the image                 | 1,082         | 499.4      | 319 ms | 0.12 s      | 104 ms         |
| 666 round dashes on a stroke as wide as the image                  | 701           | 499.0      | 25 ms  | 0.12 s      | 50 ms          |
| 523 square dashes on a stroke as wide as the image                 | 558           | 499.4      | 3 ms   | 0.04 s      | 34 ms          |
| 2,342 dashes on a stroke a tenth as wide as the image              | 2,377         | 499.5      | 88 ms  | 0.66 s      | 49 ms          |
| 3,512 dashes on a stroke 30 wide                                   | 3,548         | 499.6      | 46 ms  | 0.89 s      | 31 ms          |
| 522 dashes of four lengths on a stroke as wide as the image        | 1,082         | 499.4      | 331 ms | 0.12 s      | 84 ms          |
| 1,335 round joins on a stroke as wide as the image                 | 1,368         | 499.4      | 53 ms  | 0.32 s      | 50 ms          |
| 294 round dots on a stroke as wide as the image                    | 327           | 497.9      | 8 ms   | 0.06 s      | 23 ms          |
| 13 clip paths of two near-coincident zigzags of 3,000, as masks    | 81,927        | 473.5      | 19 ms  | 0.98 s      | 33 ms          |
| 13 of a zigzag crossing itself and a square, as masks              | 81,979        | 470.7      | 19 ms  | 0.93 s      | 33 ms          |
| 12 of five near-coincident zigzags of 3,000, as masks              | 184,777       | 436.1      | 18 ms  | 0.98 s      | 50 ms          |
| 31 clip paths of one near-coincident zigzag of 6,000               | 194,371       | 168.0      | 1 ms   | 0.03 s      | 50 ms          |
| 12 clip paths of a shape clipped in turn, as masks                 | 6,565         | 469.4      | 27 ms  | 1.44 s      | 35 ms          |
| 12 clip paths of 43 shapes, as masks                               | 20,917        | 467.1      | 33 ms  | 1.66 s      | 33 ms          |
| 7 masks holding a clipped shape                                    | 3,830         | 497.8      | 28 ms  | 1.47 s      | 52 ms          |
| 19 radial gradients on a shape scaled a million million times      | 741           | 497.4      | 37 ms  | 1.62 s      | 73 ms          |

The rows for clip paths were measured again with the rewrite on the same machine idle (load about
0.3), so they read a little low beside the rest; the clip paths are timed to their first frame. The
dashes on a wide stroke, the round dots and the clip paths written as masks stop at the overdraw
limit, and the hairline dashes, the thin view box, the five zigzags and the clip paths of one
zigzag at the drawing cost. The two documents above that took 10.6 and 5.4 seconds at 600 pixels
are refused, as is a single path of 3,000 edges across the image, which took 4.8 seconds at 2000
twice as dense, and so is each of the documents that broke an earlier model: 3,000 dashes on a
stroke as wide as the image (15.2 seconds), clip paths of 43 shapes or of clipped shapes, which
Chromium draws as masks (4.7 seconds), a hairline zigzag with a dash array of 64
lengths, whose dashes were once counted as one a repeat (1.1 seconds as an image at 600 pixels,
3.9 inline, where the same drawing cost in dashes of two lengths takes 30 and 136 ms), a transform
that overflows to infinity, whose `NaN` once turned the overdraw off, and a view box stretched or
sliced past the square the budget assumes, which is now shown whole instead (below). The clip paths
that broke earlier models are accepted now and written as masks, and are fast: two zigzags of 200
segments crossing (14.9 seconds to their first frame as a clip path) took 3 ms at 600 pixels, 0.11
seconds at 2000 twice as dense and 33 ms inline; drawn as one shape beside a square (2.4 seconds,
12.5 on a reviewer's machine), 3 ms, 0.11 seconds and 18 ms; the reviewer's near-coincident
zigzags (7.8 minutes, 22 and 16.9 seconds), 3 ms, 0.11 seconds and 17 to 34 ms.

The browser test rasterises each of these families under a budget of 3 seconds at 600 pixels and 6
at 2000 twice as dense, and draws each inline at 600 under 3 seconds. With the overdraw limit raised
tenfold, nine families blew through them (4.5 to 16.5 seconds: the gradients, layers, masks, the
even-odd clip path, the butt and four-length dashes and the scaled shape), and in four more another
limit took over first; and counting one dash a repeat in the drawing
cost, the hairline dashes of 64 lengths ran into the overdraw limit first. Real logos stay inside
both budgets: a Figma export with eight full-size alpha masks and ten gradients under six clip paths
come to about 59% of the overdraw (they take 0.9 and 0.46 seconds themselves at 2000 twice as
dense), emblems of 8,000 cubics to 9.3%, finely dashed rings to 7.9%, traced artwork near the input
limit to under 1%.

What the budgets cover: a logo drawn as an `<img>` (or a CSS background) at any size up to 2000 CSS
pixels at a device scale factor of 2, and a logo drawn inline up to 600 CSS pixels at a scale factor
of 1. Inline at larger sizes is not supported. Chromium draws a large inline SVG tile by tile, and
every tile walks again each path it touches, so long paths cost many times over: seven uses of a
serpentine of 25,000 segments with round joins, at 88% of the drawing cost, took 0.57 seconds as an
image at 600 pixels, 0.64 at 2000 twice as dense and 0.48 inline at 600, but 10.9 seconds inline at
2000 twice as dense. Show a logo at a large size only through `logoDataUrl` in an `<img>` with a
bounded width and height.

What the budgets do not bound: other renderers (Firefox, Safari, librsvg, a design tool), which
were not measured; a GPU rasteriser, which is usually faster; and sizes beyond those measured,
since paint costs in proportion to the pixels covered: a logo shown at 4000 CSS pixels twice as
dense costs about four times what it does at 2000. The budget also assumes the logo is shown
whole: `preserveAspectRatio` `none` and `slice` are dropped (a cropped view box becomes the part
that showed, and a stretched one is clipped to itself), so the view box is always fitted inside
its frame (`xMidYMid meet`), but a host can still stretch or crop it. Drawn as an `<img>`
sized by CSS (with the default `object-fit: fill`, or `contain`) or inline sized by CSS, a logo
1,000 wide and 1 tall stays one line in Chromium; `object-fit: cover`, or a canvas `drawImage`
into a box of another shape, stretches it over the whole box. So show a logo at a logo's size: give
the `<img>` a bounded width and height (a few hundred CSS pixels at most), never `object-fit: cover`
or a stretched canvas, and draw it once rather than at a size a page may grow without limit. Size it
by one dimension, letting the other follow, or keep the frame's proportions (`width` and `height`
from the result): a box of other proportions stretches or letterboxes the logo, which is the host's
choice and outside what the sanitiser promises. Two more limits: Chromium rounds the height of an
`<img>` sized by its width alone down to a sixty-fourth of a CSS pixel, so a very elongated logo
(hundreds to one) whose slice or stretch was rewritten can letterbox by several device pixels at
its automatic height; give it both sizes from the result. And drawing a logo on a canvas lays it
out at its natural size rounded to whole pixels, which is outside the supported scope.

### Rendering: `<img>` first, sanitising always

Show a logo through `<img src>` (or a CSS background), never inline. `logoDataUrl(svg)` returns a
`data:image/svg+xml;charset=utf-8,` URL, percent-encoded: smaller than base64 for SVG's mostly
ASCII text, and free of quotes, angle brackets, ampersands, white space and `#` (which would end
the data), so it is safe in any attribute or CSS string. A page's Content-Security-Policy must allow
it: `img-src 'self' data:` (the strict policy the components are tested under,
`default-src 'self'`, does not). Allowing `data:` for images lets no script run; the choice of
percent-encoding or base64 makes no difference to the policy, which matches the scheme only. If a
policy may not allow `data:`, serve the sanitised SVG as a file from your own origin instead, with
`Content-Type: image/svg+xml`, `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'` on that response (so it is inert even when opened
directly), and `img-src 'self'` is enough. A `blob:` URL made in the page from the sanitised string
(`URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))`) also works, with `img-src blob:`
in the policy; it is no safer than a data URL, and must be revoked when the image is gone.

An SVG drawn as an image is the second layer: browsers run no script in it, fire no events, follow
no links and load nothing external, whatever it holds. Sanitising is still required, because the
image context is not the only place a logo ends up: it may be downloaded and opened directly (as a
document, where script runs on the origin it is served from), served from a URL someone visits,
inlined into a page by a consumer who wants to style it, pasted into an email or a design tool, or
read by an older or unusual renderer. The sanitised output is inert in all of these: the browser
test renders every accepted output of the hostile corpus and every clean logo both through `<img>`
and inline through `innerHTML`, with no policy at all and under the strict one, and checks that no
script ran, nothing was fetched and no policy violation fired (and, as a control, that the same
checks catch the unsanitised corpus inline; drawn as images, even the unsanitised files run and
load nothing, which is the second layer at work, and why only inline can be the control).

### Threat model

It protects against: script and event handlers in any form (elements, attributes, SMIL, CSS,
`javascript:`, `vbscript:` and `data:` URLs, with entities, control characters, case and white
space used to hide them); external loads and references of every kind (`href`, `url()`, `@import`,
`xml:base`, entities, `xml-stylesheet`); XML attacks (entity expansion, external entities,
encoding confusion); parser differentials (namespace tricks, comments and CDATA HTML reads
differently, markup that changes meaning when re-parsed as HTML, since the output holds nothing but
allowlisted markup and escaped text); DOM clobbering through ids; and denial of service through
size, nesting, numbers, `use` expansion, reference cycles and the cost of drawing (long paths,
curves, dashes, masks and layers, multiplied through `use`).

It does not judge what a logo shows: trademark, offensive or misleading content, a logo that
imitates another brand, or visual spoofing inside the logo's box (a drawn "verified" badge, a fake
button) are out of scope, as is anything a page does with a logo outside it (a logo is drawn where
the page puts it, at the size the page gives it). Text in a `title` or `desc` is kept as escaped
text, so a consumer that shows it must still treat it as text. The geometry is kept to six
decimals; colours set only by CSS are lost (see above).

The tests hold it to that: a hostile corpus of 284 files (`src/__fixtures__/hostile-svg`, one
technique each, with the expected outcome in `expectations.json`: the error code for each of the 128
refused, and every removal, by element, attribute and reason, for each of the 156 accepted, 40 of
them with a clip path written as a mask) and
generated oversized inputs, each refused or accepted with an output an independent checker finds
inert (its own tokeniser, its own copy of the allowlist, its own grammar for every value and its
own rules for where each element may stand); a clean corpus of logos as Inkscape, Illustrator,
Figma and Sketch export them, with golden outputs and geometry compared number by number; 35,000
seeded random documents, strings, byte arrays and mutated logos, checking that it never throws and
that every output is valid, idempotent, deterministic and within the drawing cost limit; 5,000
random documents of clip paths and masks (clipped in turn and themselves, `use`s of groups, names
the sanitiser gives what it adds, stretched and cropped view boxes), checking every output is valid, a fixed point and no
larger than an input may be; 3,000
random graphs of definitions, uses, masks, layers and dashes whose cost a separate model works out,
checking the sanitiser measures the same cost and refuses exactly what goes over a limit; and 4,000
random chains of linear and radial gradients and masks beside a crop or a slice that crops nothing,
checking the sanitiser refuses exactly those a separate model, resolving `href` and defaults its own
way, finds taking a percentage of the view box; 12,000 random meets, slices and stretches, half of
view boxes a fraction of a unit across, in every alignment and absolute unit, sized from a
thousandth to a thousand times the view box and to six decimals or more, checking against a
separate geometric model of what a browser shows that no output shows more than half a device
pixel past what the original showed; and 6,000 logos as design tools export them (two or three
decimals, ordinary sizes), checking none is refused that these view boxes, the view box kept whole
or the crop written to six decimals, could show. That last check tries the sanitiser's own
candidates, so unlike the geometric model it is not independent of the sanitiser: it finds a
refusal of a logo the sanitiser itself could have written, not one some other view box could.

## Commands

```sh
pnpm --filter @identgineer/brand typecheck
pnpm vitest run --project brand
```
