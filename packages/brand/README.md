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

`sanitiseSvgLogo(input, { idPrefix })` never throws. It returns `{ ok: true, svg, width, height,
viewBox, removed, removedCount }` or `{ ok: false, errors }`, with one located error whose message
never repeats the input. `svg` is a `SanitisedSvg`, a string branded for the type checker, so a
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

- anything the strict reader does not understand: a `DOCTYPE` of any kind (so no entity
  expansion, no billion laughs, no external entities), a processing instruction (an
  `xml-stylesheet` included) other than a leading XML declaration, which must say version 1.0 and,
  if it names one, encoding UTF-8; an entity other than `&lt; &gt; &amp; &quot; &apos;`; a
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
- going over any limit below.

Dropped (and listed in `removed`, with the element, attribute or style property, a reason and a
line and column): an element not on the allowlist, together with everything inside it (children
are never lifted out of a dropped element); an attribute not on the element's list; a value that
fails its grammar; a `use` or a reference whose target is missing or the wrong kind (a missing
paint server becomes `none`, which is what a browser draws, rather than black); character data
outside `title` and `desc`. The reasons are `active-content`, `event-handler`,
`external-reference`, `styling`, `editor-metadata`, `text`, `filter`, `foreign-namespace`,
`unsupported-element`, `unsupported-attribute`, `invalid-value`, `misplaced`, `dangling-reference`
and `character-data`. Script, handlers and external references can be dropped rather than refused
because the output is built only from what passed, so it is inert whatever the input tried. The
first 100 removals are listed and `removedCount` counts them all.

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
| `clipPath`, `mask`                 | `clipPathUnits` / `x`, `y`, `width`, `height`, `maskUnits`, `maskContentUnits`, `transform`, presentation                                    |
| `title`, `desc`                    | none; their text is kept and escaped                                                                                                         |

Presentation attributes: `fill`, `fill-opacity`, `fill-rule`, `stroke`, `stroke-width`,
`stroke-opacity`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`,
`stroke-dashoffset`, `opacity`, `color`, `clip-path`, `clip-rule`, `mask`, `display`,
`visibility`, `vector-effect`, `shape-rendering`.

Each value has a grammar: numbers and lengths (`px`, `%`, `em`, `ex`, `mm`, `cm`, `in`, `pt`, `pc`);
colours (`#rgb`, `#rrggbb`, `rgb()`, the CSS named colours, `currentColor`, written back as
`#rrggbb` or the keyword); paint (`none`, a colour or `url(#id)` to a gradient); `clip-path` and
`mask` (`none` or `url(#id)` to a clip path or mask); transform lists (`matrix`, `translate`,
`scale`, `rotate`, `skewX`, `skewY`, at most 16); path data (every command, arc flags included);
points, `viewBox` (positive width and height), `preserveAspectRatio`, dash arrays (at most 64
lengths) and the enumerations. A reference is only ever to an id in the same document, which must
match `[A-Za-z_][A-Za-z0-9_-]{0,63}` and exist: no URL scheme, no other file, no `data:` URL.

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
  attribute; the output never holds a style attribute. Inkscape writes colours this way, so they
  survive; a logo coloured only by a stylesheet (Illustrator's default "Internal CSS") comes out
  black: export with "Presentation Attributes" instead.
- **No DOCTYPE, even the public SVG 1.1 one.** Older Illustrator files carry it; save again
  without it ("SVG 1.1" profile off, or File > Export As > SVG).
- **Editor metadata goes.** Inkscape, Sodipodi, RDF, Creative Commons, Dublin Core, Adobe, Sketch
  and Serif namespaces, `metadata`, `xml:space`, `version`, the root's `x` and `y`.
- **`xml:base` goes**, so it cannot redirect a fragment reference to another document.
- **Ids are renamed** to `idPrefix` and a number (default `logo-`), in document order, and ids
  nothing refers to are dropped: an inlined logo cannot clobber a page's ids or globals
  (`id="location"`) or collide with another logo's gradient. Give a mark a different prefix if both
  are inlined.
- **An element without a namespace declaration is read as SVG**, as a browser reads inline SVG in
  HTML; an element whose default namespace is changed (to XHTML, MathML, or nothing) is dropped.

### Limits

Each is in `SVG_LOGO_LIMITS`; going over one refuses the document.

| Limit                  | Value         | Why                                                                                      |
| ---------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `inputBytes`           | 512 KiB UTF-8 | Larger than any reasonable logo; checked before anything is read                         |
| `elements`             | 4,096         | Start tags in the input, dropped ones included                                           |
| `depth`                | 32            | Elements open at once; also bounds every walk of the tree                                |
| `attributesPerElement` | 64            | Editors write about 20 on a busy element                                                 |
| `attributeValueLength` | 4,096         | One value as written, other than path data                                               |
| `pathDataLength`       | 128 KiB       | One `d` or `points`; traced artwork is long, but not unbounded                           |
| `textLength`           | 2,048         | One run of text, and a whole `title` or `desc`                                           |
| `nameLength`           | 64            | An element or attribute name                                                             |
| `numberLength`         | 32            | One number as written; exponents take at most 3 digits                                   |
| `integerDigits`        | 6             | Every number is below 1,000,000 in magnitude                                             |
| `fractionDigits`       | 6             | Kept after the point, rounded half away from zero (exact, in decimal, never a float)     |
| `gradientStops`        | 64            | Stops in one gradient                                                                    |
| `referenceDepth`       | 8             | References followed in a row (`use`, gradient `href`, `clip-path`, `mask`)               |
| `renderedElements`     | 20,000        | Elements drawn once every `use`, clip path and mask is expanded: billion laughs by `use` |
| `ids`                  | 1,024         | Elements with an id                                                                      |

The reader works in one pass, in time linear in the input, with no recursion over the input and no
regular expression with nested quantifiers on it; the tests read a megabyte of each adversarial
shape (bare ampersands, unclosed comments and attributes, a megabyte of path data, sixty
thousand uses of one group) with the limits raised, each in under a second on a laptop.

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
directly), and `img-src 'self'` is enough.

An SVG drawn as an image is the second layer: browsers run no script in it, fire no events, follow
no links and load nothing external, whatever it holds. Sanitising is still required, because the
image context is not the only place a logo ends up: it may be downloaded and opened directly (as a
document, where script runs on the origin it is served from), served from a URL someone visits,
inlined into a page by a consumer who wants to style it, pasted into an email or a design tool, or
read by an older or unusual renderer. The sanitised output is inert in all of these: the browser
test renders every accepted output of the hostile corpus and every clean logo both through `<img>`
and inline through `innerHTML`, with no policy at all and under the strict one, and checks that no
script ran, nothing was fetched and no policy violation fired (and, as a control, that the same
checks catch the unsanitised corpus).

### Threat model

It protects against: script and event handlers in any form (elements, attributes, SMIL, CSS,
`javascript:`, `vbscript:` and `data:` URLs, with entities, control characters, case and white
space used to hide them); external loads and references of every kind (`href`, `url()`, `@import`,
`xml:base`, entities, `xml-stylesheet`); XML attacks (entity expansion, external entities,
encoding confusion); parser differentials (namespace tricks, comments and CDATA HTML reads
differently, markup that changes meaning when re-parsed as HTML, since the output holds nothing but
allowlisted markup and escaped text); DOM clobbering through ids; and denial of service through
size, nesting, numbers, `use` expansion and reference cycles.

It does not judge what a logo shows: trademark, offensive or misleading content, a logo that
imitates another brand, or visual spoofing inside the logo's box (a drawn "verified" badge, a fake
button) are out of scope, as is anything a page does with a logo outside it (a logo is drawn where
the page puts it, at the size the page gives it). Text in a `title` or `desc` is kept as escaped
text, so a consumer that shows it must still treat it as text. The geometry is kept to six
decimals; colours set only by CSS are lost (see above).

The tests hold it to that: a hostile corpus of 166 files (`src/__fixtures__/hostile-svg`, one
technique each, with the expected outcome in `expectations.json`) and generated oversized inputs,
each refused or accepted with an output an independent checker (its own tokeniser and its own copy
of the allowlist) finds inert; a clean corpus of logos as Inkscape, Illustrator, Figma and Sketch
export them, with golden outputs and geometry compared number by number; and 35,000 seeded random
documents, strings, byte arrays and mutated logos, checking that it never throws and that every
output is valid, idempotent and deterministic.

## Commands

```sh
pnpm --filter @identgineer/brand typecheck
pnpm vitest run --project brand
```
