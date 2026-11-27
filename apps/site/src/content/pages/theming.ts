import {
  bullets,
  code,
  example,
  h2,
  h3,
  link,
  p,
  page,
  repository,
  sample,
  table,
  warning,
  type Piece,
} from "../authoring";

/** A list of ids as code, separated as a sentence is: `a`, `b` and `c`. */
function ids(...values: string[]): Piece[] {
  return values.flatMap((value, index) => {
    const separator = index === 0 ? [] : [index === values.length - 1 ? " and " : ", "];
    return [...separator, code(value)];
  });
}

export const THEMING = page({
  slug: "theming",
  title: "Theming guide",
  summary:
    "Four attributes on the root element set the theme, the design language, the layout and the UX mode. What each one owns, how to keep a visitor's choice without a flash, and how a brand kit becomes a theme.",
  body: [
    h2("The four axes"),
    p(
      "Each axis is an attribute on the root element with eight values, and any value of one mixes with any value of the others: 4,096 looks from one set of markup. A page needs no JavaScript to use them.",
    ),
    table(
      "The variation attributes",
      ["Attribute", "Values", "Default"],
      [
        [
          code("data-theme"),
          ids("aurora", "ember", "tidal", "graphite", "citrus", "orchid", "terminal", "paper"),
          code("aurora"),
        ],
        [
          code("data-design"),
          ids("flat", "soft", "glass", "brutalist", "outline", "elevated", "pixel", "editorial"),
          code("flat"),
        ],
        [
          code("data-layout"),
          ids(
            "top-bar",
            "side-rail",
            "split-hero",
            "magazine",
            "dashboard",
            "centered",
            "bento",
            "immersive",
          ),
          code("top-bar"),
        ],
        [
          code("data-ux"),
          ids("comfortable", "compact", "spacious", "playful", "calm", "focus", "guided", "power"),
          code("comfortable"),
        ],
        [
          code("data-scheme"),
          [...ids("light", "dark"), "; absent follows the system"],
          "the system's",
        ],
      ],
    ),
    example("theme-tiles", "The eight themes, each drawn in its own colours and type."),
    h2("What each axis owns"),
    p(
      "Every axis sets its own tokens and no other's, which is what lets them mix. The build refuses a value that sets another axis's token, leaves one of its own out, or, for a theme, misses WCAG 2.2 AA contrast in either scheme.",
    ),
    table(
      "The tokens each axis sets",
      ["Axis", "Owns"],
      [
        ["Theme", "Colour, the brand gradient and the font families, in a light and a dark scheme"],
        ["Design", "Corners, borders, shadows, surfaces, the focus ring and ornament"],
        ["Layout", "The content's measure, gutters, gaps, the grid, the aside and the navigation"],
        ["UX mode", "Density, the type scale, motion, feedback and how strongly focus is shown"],
      ],
    ),
    h2("Using the tokens"),
    p(
      "Every token is a custom property: ",
      code("--idg-"),
      " and its path, so ",
      code("color.bg-subtle"),
      " is ",
      code("--idg-color-bg-subtle"),
      ". Custom properties reach into shadow roots, so a component and your own CSS read the same values.",
    ),
    sample(
      "css",
      `
.note {
  padding: var(--idg-space-s);
  border: var(--idg-border-width) var(--idg-border-style) var(--idg-color-border);
  border-radius: var(--idg-shape-radius-md);
  background: var(--idg-color-bg-subtle);
  font-size: calc(var(--idg-font-size-step-0) * var(--idg-ux-type-scale));
}
`,
      "A box that every look re-skins",
    ),
    p(
      "Scales are applied where a value is used: a UX mode sets ",
      code("--idg-ux-type-scale"),
      " and ",
      code("--idg-density-gap-scale"),
      ", and your CSS multiplies by them.",
    ),
    warning(
      "Some tokens can be a bare zero",
      "A design without borders sets ",
      code("--idg-border-width"),
      " to 0, and a layout without a pinned bar does the same to ",
      code("--idg-layout-sticky-inset"),
      ". Arithmetic on a bare 0 in a length makes the whole declaration invalid, so use those tokens as they are, or read them through a property registered as a length.",
    ),
    h2("A visitor's choice, before the first paint"),
    p(
      "The bootstrap script of ",
      code("@identgineer/variations"),
      " reads the address, then storage, checks every value against the list of known ones and sets the attributes before the page is painted. Put it first in the head:",
    ),
    sample(
      "html",
      `
<head>
  <meta charset="utf-8" />
  <script src="/variations/bootstrap.js" integrity="sha384-COPY-FROM-bootstrap.sri.json"></script>
  <link rel="stylesheet" href="/tokens/index.css" />
</head>
`,
    ),
    bullets(
      "It must block, so it has no async, no defer and no module type.",
      "It holds no inline code, so a strict policy needs only script-src 'self', and it works with Trusted Types.",
      "It only reads. A choice is stored by the switcher, or by applyVariations with persist.",
      [
        "A shared address such as ",
        code("?idg-theme=ember&idg-design=glass"),
        " is applied by the recipient's bootstrap script before their first paint.",
      ],
    ),
    h2("The switcher"),
    sample(
      "html",
      `
<idg-variation-switcher heading="Appearance" persist></idg-variation-switcher>
<idg-variation-switcher axes="theme,scheme" orientation="inline"></idg-variation-switcher>
`,
    ),
    table(
      "The switcher's attributes",
      ["Attribute", "Meaning"],
      [
        [
          code("persist"),
          "Store each change, so the bootstrap script can restore it on the next visit",
        ],
        [
          code("axes"),
          ["A comma-separated choice of ", ...ids("theme", "design", "layout", "ux", "scheme")],
        ],
        [code("orientation"), [code("stacked"), ", the default, or ", code("inline")]],
        [code("heading"), "A visible heading that also names the panel"],
      ],
    ),
    h3("Without the switcher"),
    p(
      "The runtime needs no component. It is TypeScript source, so import it from a script your bundler builds:",
    ),
    sample(
      "ts",
      `
import { applyVariations, onVariationsChange } from "@identgineer/variations";

applyVariations({ theme: "tidal", scheme: "dark" }, { persist: true });
const stop = onVariationsChange(({ state, changed }) => console.log(changed, state));
`,
    ),
    h2("A theme from a brand kit"),
    p(
      code("@identgineer/brand"),
      " checks a kit, works out a light and a dark palette that pass the same contrast checks as the built-in themes, and writes it out as CSS scoped to its own ",
      code("data-theme"),
      " value:",
    ),
    sample(
      "ts",
      `
import { emitBrandThemeCss, generateBrandTheme, parseBrandKit } from "@identgineer/brand";
import { applyVariations, isVariationId, registerThemeIds } from "@identgineer/variations";

const result = parseBrandKit(JSON.parse(body)); // untrusted input
if (!result.ok) return respond(422, result.errors);

const theme = generateBrandTheme(result.kit);
const css = emitBrandThemeCss(theme); // serve it after the tokens stylesheet

registerThemeIds([theme.id]);
if (isVariationId("theme", theme.id)) applyVariations({ theme: theme.id });
`,
      "From a kit to a theme in use",
    ),
    bullets(
      "Fonts are chosen from pairings of fonts that ship with common systems, so nothing is fetched.",
      "A kit's corners are a preference: the square designs (brutalist, editorial and pixel) keep their own.",
      "Colours the generator had to move for contrast are listed, for the brand's guidelines.",
    ),
    p(
      "More in the READMEs of ",
      link(repository("packages/tokens/README.md"), "the tokens"),
      ", ",
      link(repository("packages/variations/README.md"), "the variations runtime"),
      " and ",
      link(repository("packages/brand/README.md"), "brand kits"),
      ".",
    ),
  ],
});
