# @identgineer/tokens

Design tokens and the eight colour themes. Authored as [W3C Design Tokens](https://www.designtokens.org/)
JSON (`$value`, `$type`, `{group.token}` aliases) and built into CSS custom properties with a
deterministic TypeScript script. No fonts are shipped or fetched; typography uses system and
web-safe stacks only.

## Consume

```html
<link rel="stylesheet" href="@identgineer/tokens/css" />
<html data-theme="ember" data-scheme="dark"></html>
```

- `dist/index.css` has everything. `dist/tokens.css` is the base alone; add
  `dist/themes/<id>.css` for each theme you ship.
- `data-theme` picks the theme (default `aurora`, also used when the attribute is absent).
- `data-scheme="light" | "dark"` forces a scheme. Without it the theme follows
  `prefers-color-scheme`.
- Layers are declared as `@layer idg.tokens, idg.theme;`. Unlayered CSS always wins over both.

From TypeScript:

```ts
import { THEMES, TOKEN_NAMES, type ThemeId } from "@identgineer/tokens";
```

`THEMES` lists `id`, `label`, `description`, resolved `fonts` and preview `swatches` for both
schemes. It is built from the same JSON as the CSS, so it cannot drift.

## Token names

Every custom property is `--idg-` plus the token path with dots turned into dashes:
`color.bg-subtle` is `--idg-color-bg-subtle`.

| Group                                                          | Examples                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `color.*` (theme-owned)                                        | `bg`, `surface`, `text`, `text-muted`, `border`, `accent`, `on-accent`, `link`, `focus-ring`   |
| `color.<status>*` (theme-owned)                                | `success`, `on-success`, `success-subtle`, `on-success-subtle`, likewise warning, danger, info |
| `gradient.brand` (theme-owned)                                 | signature hero gradient                                                                        |
| `font.family.*`, `font.display.*`, `font.body.*` (theme-owned) | families, display weight, letter-spacing, line-height                                          |
| `font.size.step-neg1 .. step-6`                                | fluid type scale (`clamp()`, 320px to 1280px)                                                  |
| `space.3xs .. 3xl`                                             | fluid space scale                                                                              |
| `font.weight.*`, `font.line-height.*`, `font.letter-spacing.*` | shared scales                                                                                  |
| `shape.*`, `elevation.*`, `density.*`, `motion.*`              | neutral defaults, owned by design languages and UX modes (feature 3)                           |

Themes own colour and typography only. The build rejects a theme that defines anything else,
omits a role in either scheme, or fails WCAG 2.2 AA contrast (4.5:1 for text pairs, 3:1 for
`focus-ring` and `border-strong` against `bg`).

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
src/tokens/{shape,elevation,density,motion}.json
src/tokens/themes/<id>.json common (typography), light and dark (colour, gradient)
```

Colours are `#rrggbb` only so contrast is exact. Where CSS needs a function, `dimension` and
`shadow` tokens carry a CSS string (for example `clamp(...)`), a deliberate extension of the format.

## Commands

```sh
pnpm --filter @identgineer/tokens build      # writes dist/ (verifies themes and contrast first)
pnpm --filter @identgineer/tokens typecheck
```

Adding a theme: add `src/tokens/themes/<id>.json`, then register the id in `src/theme-ids.ts` and
the import in `src/theme-sources.ts`. A test fails if the files on disk and the registry disagree.
