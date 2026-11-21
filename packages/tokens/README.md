# @identgineer/tokens

Design tokens, eight colour themes, eight design languages and eight UX modes. Authored as [W3C Design Tokens](https://www.designtokens.org/)
JSON (`$value`, `$type`, `{group.token}` aliases) and built into CSS custom properties with a
deterministic TypeScript script. No fonts are shipped or fetched; typography uses system and
web-safe stacks only.

## Consume

```html
<link rel="stylesheet" href="@identgineer/tokens/css" />
<html data-theme="ember" data-scheme="dark" data-design="glass" data-ux="compact"></html>
```

- `dist/index.css` has everything. `dist/tokens.css` is the base alone; add
  `dist/themes/<id>.css`, `dist/designs/<id>.css` and `dist/ux/<id>.css` for each value you ship,
  and `dist/preferences.css` last.
- Three independent axes, each set by an attribute and combinable with the others freely. Every
  one defaults when its attribute is absent.

| Attribute     | Axis            | Owns                                                    | Default       |
| ------------- | --------------- | ------------------------------------------------------- | ------------- |
| `data-theme`  | Colour theme    | colour, gradient, typography families                   | `aurora`      |
| `data-design` | Design language | shape, border, elevation, surface, focus ring, ornament | `flat`        |
| `data-ux`     | UX mode         | density, type scale, motion, feedback, focus emphasis   | `comfortable` |

- `data-scheme="light" | "dark"` forces a colour scheme. Without it the theme follows
  `prefers-color-scheme`.
- Layers are declared as `@layer idg.tokens, idg.theme, idg.design, idg.ux, idg.preferences;`.
  Unlayered CSS always wins over all of them.
- Put `data-design` and `data-ux` on the same element as `data-theme`, or on a descendant of it.
  Shadows and borders are built from theme colours with `var()`, which resolves where the rule
  matches, so a design set on an ancestor of the theme would read the wrong colours.

From TypeScript:

```ts
import {
  DESIGNS,
  THEMES,
  TOKEN_NAMES,
  UX_MODES,
  type DesignId,
  type ThemeId,
  type UxModeId,
} from "@identgineer/tokens";
```

`THEMES` lists `id`, `label`, `description`, resolved `fonts` and preview `swatches` for both
schemes. `DESIGNS` and `UX_MODES` list `id`, `label` and `description`. All three are built from
the same JSON as the CSS, so they cannot drift.

## Token names

Every custom property is `--idg-` plus the token path with dots turned into dashes:
`color.bg-subtle` is `--idg-color-bg-subtle`.

| Group                                                                           | Examples                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `color.*` (theme-owned)                                                         | `bg`, `surface`, `text`, `text-muted`, `border`, `accent`, `on-accent`, `link`, `focus-ring`   |
| `color.<status>*` (theme-owned)                                                 | `success`, `on-success`, `success-subtle`, `on-success-subtle`, likewise warning, danger, info |
| `gradient.brand` (theme-owned)                                                  | signature hero gradient                                                                        |
| `font.family.*`, `font.display.*`, `font.body.*` (theme-owned)                  | families, display weight, letter-spacing, line-height                                          |
| `font.size.step-neg1 .. step-6`                                                 | fluid type scale (`clamp()`, 320px to 1280px)                                                  |
| `space.3xs .. 3xl`                                                              | fluid space scale                                                                              |
| `font.weight.*`, `font.line-height.*`, `font.letter-spacing.*`                  | shared scales                                                                                  |
| `shape.*`, `border.*`, `elevation.*`, `surface.*`, `focus.ring-*`, `ornament.*` | design-language-owned                                                                          |
| `density.*`, `ux.*`, `motion.*`, `feedback.*`, `focus.emphasis`                 | UX-mode-owned                                                                                  |

Themes own colour and typography only. The build rejects a theme that defines anything else,
omits a role in either scheme, or fails WCAG 2.2 AA contrast (4.5:1 for text pairs, 3:1 for
`focus-ring` and `border-strong` against `bg`).

## Design languages and UX modes

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
`motion.enabled` (`1` allows movement, `0` means fades only); `feedback.hover-lift|press-scale`;
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
- `prefers-contrast: more`: border colours become `--idg-color-border-strong`; focus ring 4px.
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
src/tokens/ux.json          neutral defaults for everything a UX mode owns
src/tokens/preferences.json reduced-motion, more-contrast and forced-colors overrides
src/tokens/themes/<id>.json common (typography), light and dark (colour, gradient)
src/tokens/designs/<id>.json tokens, and an optional opaque fallback group
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

Adding a design language or UX mode works the same way: add `src/tokens/designs/<id>.json` or
`src/tokens/ux/<id>.json`, register the id in `src/design-ids.ts` or `src/ux-ids.ts`, and add the
import in `src/design-sources.ts` or `src/ux-sources.ts`.
