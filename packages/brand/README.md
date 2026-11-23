# @identgineer/brand

Brand identity: a brand kit (name, colours, a font pairing, corners and tone) turned into a
complete colour theme for your own project. A generated theme is one more value of `data-theme`,
next to the eight built-in themes of [`@identgineer/tokens`](../tokens/README.md), and is held to
the same checks they are.

Pure TypeScript: no DOM, no network, no dependency besides `@identgineer/tokens`. It runs in Node
and in browsers. Logos are not part of a kit yet.

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

| Field                | Rule                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | The `data-theme` value, by the tokens package's added theme id rule: 2 to 32 lower-case letters and digits in words joined by single hyphens, starting with a letter; not a built-in id of any axis, a CSS-wide keyword, `default`, `none`, `auto`, `system`, `light`, `dark`, `brand`, `theme`, `custom`, `constructor` or `prototype` (`RESERVED_BRAND_IDS`, which is `RESERVED_THEME_IDS`)                                     |
| `name`               | 1 to 60 characters: letters, marks (at most four non-spacing or enclosing marks in a row) and digits of any script, single inner spaces (never two in a row), `. , ' ’ & ! ? -`, the Hebrew geresh and gershayim (`׳ ״`), the middle dots `·` and `・`, and a zero-width non-joiner or joiner between two letters or marks (as Persian and Sinhala need); other format characters, bidirectional controls among them, are refused |
| `tagline` (optional) | The same, up to 120 characters                                                                                                                                                                                                                                                                                                                                                                                                    |
| `colors.primary`     | `#rgb` or `#rrggbb`, either case                                                                                                                                                                                                                                                                                                                                                                                                  |
| `colors.secondary`   | Optional, the same                                                                                                                                                                                                                                                                                                                                                                                                                |
| `colors.neutralTint` | Optional, the same: its hue tints backgrounds, text and borders                                                                                                                                                                                                                                                                                                                                                                   |
| `typography`         | One of `TYPOGRAPHY_IDS`: `system`, `geometric`, `humanist`, `grotesque`, `classic-serif`, `book`, `technical`                                                                                                                                                                                                                                                                                                                     |
| `corners`            | `sharp`, `soft` or `round`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tone`               | `calm`, `balanced` or `vivid`                                                                                                                                                                                                                                                                                                                                                                                                     |

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

## Commands

```sh
pnpm --filter @identgineer/brand typecheck
pnpm vitest run --project brand
```
