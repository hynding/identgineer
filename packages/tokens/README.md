# @identgineer/tokens

Design tokens, eight colour themes, eight design languages, eight page layouts and eight UX modes. Authored as [W3C Design Tokens](https://www.designtokens.org/)
JSON (`$value`, `$type`, `{group.token}` aliases) and built into CSS custom properties with a
deterministic TypeScript script. No fonts are shipped or fetched; typography uses system and
web-safe stacks only.

## Consume

```html
<link rel="stylesheet" href="@identgineer/tokens/css" />
<html
  data-theme="ember"
  data-scheme="dark"
  data-design="glass"
  data-layout="magazine"
  data-ux="compact"
></html>
```

- `dist/index.css` has everything. `dist/tokens.css` is the base alone; add
  `dist/themes/<id>.css`, `dist/designs/<id>.css`, `dist/layouts/<id>.css` and `dist/ux/<id>.css` for each value you ship,
  and `dist/preferences.css` last.
- Four independent axes, each set by an attribute and combinable with the others freely. Every
  one defaults when its attribute is absent.

| Attribute     | Axis            | Owns                                                    | Default       |
| ------------- | --------------- | ------------------------------------------------------- | ------------- |
| `data-theme`  | Colour theme    | colour, gradient, typography families                   | `aurora`      |
| `data-design` | Design language | shape, border, elevation, surface, focus ring, ornament | `flat`        |
| `data-layout` | Page layout     | content measure, gutters, gaps, grid, aside, navigation | `top-bar`     |
| `data-ux`     | UX mode         | density, type scale, motion, feedback, focus emphasis   | `comfortable` |

- `data-scheme="light" | "dark"` forces a colour scheme. Without it the theme follows
  `prefers-color-scheme`.
- Layers are declared as `@layer idg.tokens, idg.theme, idg.design, idg.layout, idg.ux, idg.brand, idg.preferences;`.
  Unlayered CSS always wins over all of them. `idg.brand` is empty here: it holds the corner
  preference of a theme generated from a brand kit by [`@identgineer/brand`](../brand/README.md)
  (see [Brand corners](#brand-corners)).
- Put `data-design` and `data-ux` on the same element as `data-theme`, or on a descendant of it.
  Shadows and borders are built from theme colours with `var()`, which resolves where the rule
  matches, so a design set on an ancestor of the theme would read the wrong colours.

From TypeScript:

```ts
import {
  DESIGNS,
  LAYOUTS,
  THEMES,
  TOKEN_NAMES,
  UX_MODES,
  type DesignId,
  type LayoutId,
  type ThemeId,
  type UxModeId,
} from "@identgineer/tokens";
```

`THEMES` lists `id`, `label`, `description`, resolved `fonts` and preview `swatches` for both
schemes. `DESIGNS`, `LAYOUTS` and `UX_MODES` list `id`, `label` and `description`; each design
also has `followsBrandCorners` (see [Brand corners](#brand-corners)). All four are built from
the same JSON as the CSS, so they cannot drift.

## Token names

Every custom property is `--idg-` plus the token path with dots turned into dashes:
`color.bg-subtle` is `--idg-color-bg-subtle`.

| Group                                                                           | Examples                                                                                                                                                 |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color.*` (theme-owned)                                                         | `bg`, `surface`, `text`, `text-muted`, `border`, `accent`, `on-accent`, `accent-indicator`, `on-accent-indicator`, `accent-border`, `link`, `focus-ring` |
| `color.<status>*` (theme-owned)                                                 | `success`, `on-success`, `success-subtle`, `on-success-subtle`, likewise warning, danger, info                                                           |
| `gradient.brand` (theme-owned)                                                  | signature hero gradient                                                                                                                                  |
| `font.family.*`, `font.display.*`, `font.body.*` (theme-owned)                  | families, display weight, letter-spacing, line-height                                                                                                    |
| `font.size.step-neg1 .. step-6`                                                 | fluid type scale (`clamp()`, 320px to 1280px)                                                                                                            |
| `space.3xs .. 3xl`                                                              | fluid space scale                                                                                                                                        |
| `font.weight.*`, `font.line-height.*`, `font.letter-spacing.*`                  | shared scales                                                                                                                                            |
| `shape.*`, `border.*`, `elevation.*`, `surface.*`, `focus.ring-*`, `ornament.*` | design-language-owned                                                                                                                                    |
| `layout.*`                                                                      | layout-owned                                                                                                                                             |
| `size.xs .. 3xl`, `size.screen`                                                 | fixed size scale for track minimums, side regions, thresholds and cover heights                                                                          |
| `density.*`, `ux.*`, `motion.*`, `feedback.*`, `focus.emphasis`                 | UX-mode-owned                                                                                                                                            |

Themes own colour and typography only. The build rejects a theme that defines anything else,
omits a role in either scheme, or fails WCAG 2.2 AA contrast (4.5:1 for text pairs, 3:1 for
`focus-ring` and `border-strong` against `bg`, and for `accent-indicator` and `accent-border`
against `bg`, `bg-subtle`, `surface` and `surface-raised`).

### Accent fills and indicators

The accent has three roles, because WCAG asks different things of them:

- `accent` (with `on-accent` and `accent-hover`) is a fill that carries a text label, such as a
  primary button. Only its text must pass (4.5:1), so a theme can keep a light brand colour that
  barely shows against the page: citrus light's lime is 1.19:1 on its background.
- `accent-indicator` (with `on-accent-indicator` at 4.5:1 on it) is the accent as a mark of state
  or selection on the page: a checked box, a switch that is on, a progress fill, the current page,
  the selected tab. It must reach 3:1 against every page background (WCAG 1.4.11), and against
  `accent-subtle`, the tint behind the current navigation item that its marker sits on.
- `accent-border` is the edge of an accent fill, for where the fill alone cannot be told apart from
  the page. It must reach 3:1 against every page background.
- `accent-edge` is derived by the build, never authored: `accent-border` where the accent is below
  3:1 against any page background, and `transparent` where it is not. Components draw it as the
  edge of an accent fill. Drawing the accent itself would still darken a fill's anti-aliased
  corners, so a theme whose accent stands out paints no edge at all and renders exactly as before.
  The base layer declares it as `transparent`.

Wherever the accent already reaches 3:1 against all four page backgrounds, a theme sets
`accent-indicator` and `accent-border` to the accent and `on-accent-indicator` to `on-accent`, so
nothing changes visually (the theme tests check this for every built-in theme). Among the built-in
themes only citrus light differs: its indicator is a darker lime, `#5c7d00` with white on it, and
the same colour edges its fill, so the lime has one darker partner. Which component reads which role is listed
in the [components README](../components/README.md#accent-fills-and-state-indicators).

## Design languages, layouts and UX modes

Each axis owns a disjoint set of tokens, which is what keeps the axes independent. The build
rejects a mode that omits a token its axis owns, sets one another axis owns, or sets one that
no default declares; and it rejects any token set by two axes.

Design tokens: `shape.radius.sm|md|lg|pill`; `border.width|style|color` and
`border.control-width|control-style|control-color`; `elevation.sm|md|lg`;
`surface.background|backdrop-filter|border-width|border-style|border-color`;
`focus.ring-width|ring-offset|ring-style`; `ornament.heading-transform|heading-decoration|control-transform|hard-shadow-x|hard-shadow-y`.
Border and surface widths take one to four values, so apply them with `border-width`,
`border-style` and `border-color` rather than the `border` shorthand. Shadows are `color-mix()`
expressions over theme colours, so they tint correctly in every theme and scheme.

UX tokens: `density.target-size|control-height|control-padding-inline|control-padding-block|gap-scale|measure`;
`ux.type-scale|hints|shortcuts`; `motion.duration.fast|base|slow`, `motion.easing.standard|emphasized`,
`motion.enabled` (`1` allows movement, `0` means fades only); `feedback.hover-lift|press-scale|hover-delay`
(how long a pointer rests before a hint such as a tooltip appears; not motion, so reduced motion
leaves it alone);
`focus.emphasis`. Multipliers are applied by the consumer, for example
`calc(var(--idg-font-size-step-0) * var(--idg-ux-type-scale))` and
`calc(var(--idg-focus-ring-width) * var(--idg-focus-emphasis))`. `target-size` and `control-height`
are never below 24px (WCAG 2.2 AA, 2.5.8); the build fails otherwise.

| `data-design` | Character                                                                       |
| ------------- | ------------------------------------------------------------------------------- |
| `flat`        | No shadows, hairline borders, medium radius (default)                           |
| `soft`        | Neumorphic: large radius, paired light and dark shadows from the page colour    |
| `glass`       | Translucent surfaces, backdrop blur, luminous hairline edge                     |
| `brutalist`   | Zero radius, thick text-colour borders, hard offset shadows, uppercase controls |
| `outline`     | Transparent surfaces, 2px borders, no shadow, wide offset focus ring            |
| `elevated`    | Layered soft shadows, no borders, modest radius                                 |
| `pixel`       | Square, stepped hard shadows, double and dashed borders, uppercase headings     |
| `editorial`   | Print-like: rules above and below surfaces only, underlined headings            |

### Brand corners

A theme generated from a brand kit states its corners as a preference, never as radii:
`--idg-brand-radius-sm|md|lg|pill`, set on its `[data-theme]` element in the `idg.brand` layer
(`brandRadiusVariableName(name)` gives the name). Nothing in this package declares those
properties. Whether a design takes them is its own decision, declared in its JSON as
`$extensions.identgineer.followsBrandCorners`, which every design must state as `true` or
`false` (the build refuses a design without it, and a layout or UX mode with it):

- A design that follows (`flat`, `soft`, `glass`, `outline`, `elevated`) is emitted with each
  radius as `var(--idg-brand-radius-<name>, <its own value>)`. Without a brand theme the
  preference is undeclared, so every radius computes to exactly the design's own value.
- A design whose identity is its corners declines (`brutalist`, `pixel`, `editorial`: all square)
  and is emitted with plain radii, so a brand never rounds it.

The preference is read where the design's rule matches, so it reaches a design set on the same
element as the brand theme or on a descendant of it, as the axes require anyway. It inherits like any
custom property, and no built-in theme sets it, so a built-in theme nested inside a brand-themed
ancestor still takes the brand's corners in designs that follow them.

Layout tokens: `layout.content-max` (maximum inline size of the page content, `100%` for edge to
edge), `layout.page-gutter`, `layout.section-gap`, `layout.gap` (the default gap inside the layout
primitives), `layout.columns` (most columns `idg-grid` draws), `layout.grid-min` (default minimum
track size), `layout.aside-width` (default side region of `idg-sidebar`), `layout.nav-size` (the
thickness of the bar or strip across the top that carries the navigation or the page actions),
`layout.rail-width` (the width of a navigation rail, and of the drawer that replaces the navigation
when it collapses), `layout.sticky-inset` (the block size of chrome pinned to the top of the viewport,
`0` when nothing is, so scrolling a focused element into view leaves it clear of that chrome) and
`layout.shell` (the layout's own id, which `idg-layout` reads with a style query to choose its
arrangement; it is the one token that is not a length or a number). Gaps and gutters alias the
space scale, so they stay fluid; multiply `layout.gap` by `--idg-density-gap-scale` to follow the UX
mode.

| `data-layout` | Character                                                                    | Measure | Columns | Track | Gap  |
| ------------- | ---------------------------------------------------------------------------- | ------- | ------- | ----- | ---- |
| `top-bar`     | Navigation across the top of a centred, moderately wide page (default)       | 72rem   | 4       | 14rem | `m`  |
| `side-rail`   | A fixed rail beside the content, narrower measure, wider gutters             | 64rem   | 3       | 18rem | `m`  |
| `split-hero`  | Large two-up sections, very generous gaps, wide tracks                       | 60rem   | 2       | 26rem | `l`  |
| `magazine`    | A wide editorial page of many narrow columns and deep gaps between stories   | 80rem   | 6       | 11rem | `m`  |
| `dashboard`   | A dense, near full-width canvas of small tiles, tight gutters, slim bar      | 96rem   | 8       | 8rem  | `s`  |
| `centered`    | One narrow column in the page centre, for reading or a single task           | 40rem   | 2       | 16rem | `m`  |
| `bento`       | A tight mosaic of tiles close together                                       | 76rem   | 5       | 12rem | `xs` |
| `immersive`   | Content edge to edge in very wide tracks, large section gaps, minimal chrome | 100%    | 3       | 22rem | `s`  |

| `data-ux`     | Character                                                                |
| ------------- | ------------------------------------------------------------------------ |
| `comfortable` | Balanced (default)                                                       |
| `compact`     | Tight spacing, smaller controls, short motion                            |
| `spacious`    | Generous spacing, larger type, longer measure                            |
| `playful`     | Springy overshoot easing, bigger lift and press squash, longer durations |
| `calm`        | No movement or lift, only slow fades                                     |
| `focus`       | Very large targets and type, narrow measure, thick focus ring            |
| `guided`      | Hints on, generous spacing, emphasised focus ring, medium motion         |
| `power`       | Densest, shortcut hints on, fastest motion, smallest allowed targets     |

## Preferences

`dist/preferences.css` is emitted once into the last layer, `idg.preferences`, so it beats every
design language and UX mode whatever the specificity. It applies to the root and to any element
carrying an axis attribute.

- `prefers-reduced-motion: reduce`: durations 1ms, `--idg-motion-enabled: 0`, no hover lift, no
  press squash.
- `prefers-contrast: more`: border colours become `--idg-color-text`, the strongest colour every theme guarantees, so designs that already draw borders in the text colour are not weakened; focus ring 4px.
- `forced-colors: active`: no shadows, no backdrop filter, borders in system colours.
- `glass` also falls back to an opaque surface when `backdrop-filter` is unsupported
  (`@supports`) or under `prefers-reduced-transparency: reduce`. A design opts in with an
  `opaque` group in its JSON.

## Themes

| id         | Character                                                         |
| ---------- | ----------------------------------------------------------------- |
| `aurora`   | Deep indigo, teal-to-violet gradient, geometric sans (default)    |
| `ember`    | Terracotta and warm cream, serif display over a sans body         |
| `tidal`    | Sea blue-green, soft humanist sans, light and airy                |
| `graphite` | Neutral greys, one electric blue accent, tight grotesque          |
| `citrus`   | Lime and yellow on off-white or deep olive, heavy bold display    |
| `orchid`   | Magenta-violet, high-contrast serif display                       |
| `terminal` | Phosphor green and amber on near-black, pale console light scheme |
| `paper`    | Ink on warm paper, book serif throughout, very low chroma         |

## Source layout

```
src/tokens/primitive.json   palettes, font stacks, scales (palette and stack are never emitted)
src/tokens/semantic.json    default roles for everything a theme owns
src/tokens/design.json      neutral defaults for everything a design language owns
src/tokens/layout.json      neutral defaults for everything a layout owns
src/tokens/ux.json          neutral defaults for everything a UX mode owns
src/tokens/preferences.json reduced-motion, more-contrast and forced-colors overrides
src/tokens/themes/<id>.json common (typography), light and dark (colour, gradient)
src/tokens/designs/<id>.json tokens, and an optional opaque fallback group
src/tokens/layouts/<id>.json tokens
src/tokens/ux/<id>.json     tokens
```

Colours in themes are `#rrggbb` only so contrast is exact. Where CSS needs a function, `dimension`
and `shadow` tokens carry a CSS string (for example `clamp(...)`), and the `string` type carries
other CSS values such as `color-mix(...)` or `uppercase`; both are deliberate extensions of the format.

## Commands

```sh
pnpm --filter @identgineer/tokens build      # writes dist/ (verifies themes and contrast first)
pnpm --filter @identgineer/tokens typecheck
```

Adding a theme: add `src/tokens/themes/<id>.json`, then register the id in `src/theme-ids.ts` and
the import in `src/theme-sources.ts`. A test fails if the files on disk and the registry disagree.

Adding a design language, layout or UX mode works the same way: add `src/tokens/designs/<id>.json`,
`src/tokens/layouts/<id>.json` or `src/tokens/ux/<id>.json`, register the id in `src/design-ids.ts`,
`src/layout-ids.ts` or `src/ux-ids.ts`, and add the import in `src/design-sources.ts`,
`src/layout-sources.ts` or `src/ux-sources.ts`.
