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

| Field                | Rule                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | The `data-theme` value, by the tokens package's added theme id rule: 2 to 32 lower-case letters and digits in words joined by single hyphens, starting with a letter; not a built-in id of any axis, a CSS-wide keyword, `default`, `none`, `auto`, `system`, `light`, `dark`, `brand`, `theme`, `custom`, `constructor` or `prototype` (`RESERVED_BRAND_IDS`, which is `RESERVED_THEME_IDS`) |
| `name`               | 1 to 60 characters: letters, marks and digits of any script, single inner spaces (never two in a row) and `. , ' ’ & ! ? -`                                                                                                                                                                                                                                                                   |
| `tagline` (optional) | The same, up to 120 characters                                                                                                                                                                                                                                                                                                                                                                |
| `colors.primary`     | `#rgb` or `#rrggbb`, either case                                                                                                                                                                                                                                                                                                                                                              |
| `colors.secondary`   | Optional, the same                                                                                                                                                                                                                                                                                                                                                                            |
| `colors.neutralTint` | Optional, the same: its hue tints backgrounds, text and borders                                                                                                                                                                                                                                                                                                                               |
| `typography`         | One of `TYPOGRAPHY_IDS`: `system`, `geometric`, `humanist`, `grotesque`, `classic-serif`, `book`, `technical`                                                                                                                                                                                                                                                                                 |
| `corners`            | `sharp`, `soft` or `round`                                                                                                                                                                                                                                                                                                                                                                    |
| `tone`               | `calm`, `balanced` or `vivid`                                                                                                                                                                                                                                                                                                                                                                 |

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
passes: a bisection over OKLCH lightness at constant hue, each candidate gamut-mapped back to sRGB
by reducing chroma alone and judged after rounding to 8 bits, so it passes exactly as tested. The
requirements are the tokens package's `CONTRAST_PAIRS`, read at run time, plus two of its own:
links and the focus ring also pass on cards, and body text is held to 7:1.

The primary becomes the accent unchanged whenever near-white or near-black text passes on it,
which is the case for most colours; otherwise the accent moves the shorter way in lightness, just
far enough. The hover state moves further from the text. Links and the focus ring start from the
primary (the focus ring from the secondary when there is one) and move only if they must. Status
colours start from fixed hues (green, amber, red, blue). The gradient runs from the accent to the
secondary, or to the primary turned 40°. Tone scales the chroma of tints, neutrals and status
colours, and how far text and strong borders sit from the page; it never changes the accent.

Every move is reported in `theme.adjustments`: scheme, token, origin (`primary`, `secondary` or
`generated`), requested and used colour, the background that bound the move, the threshold, and
the contrast before and after.

The theme comes back as `theme.document`, a DTCG theme source in exactly the shape of the
built-in ones (`common` typography, `light` and `dark` colour and gradient, label and
description), so the tokens package parses, verifies and emits it unchanged.

## Guarantees

Tested on every run:

- **Total.** Every kit `parseBrandKit` accepts gives a theme: white, black, greys, fully saturated
  colours, identical and near-identical primary and secondary all do.
- **Passing.** Every generated theme defines every theme-owned role in both schemes and nothing
  else (`findThemeProblems`) and passes the whole contrast suite in both schemes
  (`findContrastFailures`), checked with the tokens package's own functions over 2,700 seeded
  random colour sets and twenty edge sets, for every tone and corner style.
- **Recognisable.** The primary is used unchanged unless a move is reported; a moved brand colour
  keeps its hue within 3° while it still has colour (about 2.4° at most over 20,000 random sets); a moved
  accent lands within half a point of its threshold.
- **Deterministic.** The same kit gives byte-identical output; golden files hold two sample kits.

## Emission

`emitBrandThemeCss(theme)` writes the theme through the tokens package's own theme emitter, so it
is scoped exactly like a built-in theme file: `[data-theme="<id>"]` for light, `[data-scheme="dark"]`
for forced dark, and the `prefers-color-scheme: dark` rule for a page without `data-scheme`. It
never answers to a bare `:root`; only the default theme does.

The corners set the design-owned `shape.radius.sm|md|lg|pill`, which a theme may not own. They go
in a separate rule in the `idg.brand` cascade layer, which the tokens layer order places after the
UX modes and before the preferences: on the element carrying `data-theme`, a brand's corners
override the design language's radii. A `data-design` set on a descendant still sets its own.

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
