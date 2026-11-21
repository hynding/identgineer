import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findLayoutCssViolations } from "./layout-rules";

describe("findLayoutCssViolations", () => {
  it("accepts tokens, logical properties, percentages, fr and unitless values", () => {
    const css = `
      .a { display: grid; gap: var(--_gap); inline-size: 100%; min-inline-size: 50%; }
      .b { grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--_size)), 1fr)); }
      .c { flex-basis: calc((var(--_size) - 100%) * 999); margin-block: 0; padding-inline: 0; }
      .d { border-block-start: thin solid var(--idg-color-border); }
      @container (orientation: landscape) { .e { display: block; } }
    `;
    expect(findLayoutCssViolations(css)).toEqual([]);
  });

  it.each([
    ["px", ".a { gap: 8px; }", "hard-coded length"],
    ["rem", ".a { min-inline-size: 20rem; }", "hard-coded length"],
    ["em", ".a { padding-inline: 1.5em; }", "hard-coded length"],
    ["a viewport unit", ".a { min-block-size: 100vh; }", "hard-coded length"],
    ["a length inside calc", ".a { gap: calc(var(--x) + 4px); }", "hard-coded length"],
    ["margin-left", ".a { margin-left: 0; }", "physical property"],
    ["padding-top", ".a { padding-top: 0; }", "physical property"],
    ["width", ".a { width: 100%; }", "physical property"],
    ["max-height", ".a { max-height: 100%; }", "physical property"],
    ["border-right", ".a { border-right: thin solid; }", "physical property"],
    ["left", ".a { left: 0; }", "physical property"],
    ["text-align: left", ".a { text-align: left; }", "physical value"],
    [
      "a viewport width query",
      "@media (min-width: 0) { .a { display: block; } }",
      "viewport media query",
    ],
    [
      "a viewport height query",
      "@media (max-height: 0) { .a { display: block; } }",
      "viewport media query",
    ],
  ])("refuses %s", (_name, css, rule) => {
    expect(findLayoutCssViolations(css).map((violation) => violation.rule)).toEqual([rule]);
  });

  it.each([
    ["a negative length", ".a { margin-block: -4px; }"],
    ["a positive sign", ".a { margin-block: +4px; }"],
    ["an exponent length", ".a { gap: 1e1px; }"],
    ["an uppercase unit", ".a { gap: 4PX; }"],
    ["a negative length in calc", ".a { gap: calc(var(--x) * 1 + -2rem); }"],
  ])("refuses %s", (_name, css) => {
    expect(findLayoutCssViolations(css).map((violation) => violation.rule)).toEqual([
      "hard-coded length",
    ]);
  });

  it.each(["0", "0px", "0.0rem", "-0em"])(
    "accepts the zero %s, which is a length with no size to hard-code",
    (zero) => {
      expect(findLayoutCssViolations(`.a { --_gap: ${zero}; }`)).toEqual([]);
    },
  );

  it.each(["1e1px", "1E1px", "0e3px", "1e-400px", "2.5e+2rem"])(
    "refuses the exponent form %s outright, whatever it works out to",
    (length) => {
      expect(findLayoutCssViolations(`.a { gap: ${length}; }`).map((v) => v.rule)).toEqual([
        "hard-coded length",
      ]);
    },
  );

  it.each([
    "cqw",
    "cqh",
    "cqi",
    "cqb",
    "cqmin",
    "cqmax",
    "rex",
    "rch",
    "ric",
    "rlh",
    "ic",
    "lh",
    "cap",
    "svw",
    "svh",
    "svi",
    "svb",
    "svmin",
    "svmax",
    "lvw",
    "lvh",
    "lvi",
    "lvb",
    "lvmin",
    "lvmax",
    "dvw",
    "dvh",
    "dvi",
    "dvb",
    "dvmin",
    "dvmax",
    "vi",
    "vb",
    "vmin",
    "vmax",
    "ch",
    "ex",
  ])("refuses the unit %s", (unit) => {
    expect(findLayoutCssViolations(`.a { min-inline-size: 5${unit}; }`).map((v) => v.rule)).toEqual(
      ["hard-coded length"],
    );
  });

  it("does not mistake a custom property name for a length", () => {
    expect(findLayoutCssViolations(".a { gap: var(--space-4px); }")).toEqual([]);
  });

  it.each([
    ["margin with four values", ".a { margin: 0 var(--x) 0 var(--y); }"],
    ["margin with three values", ".a { margin: 0 var(--x) 0; }"],
    ["padding with four values", ".a { padding: 0 1fr 0 1fr; }"],
    ["inset with four values", ".a { inset: 0 auto auto 0; }"],
    ["border-width with four values", ".a { border-width: thin 0 thin 0; }"],
    ["border-style with three values", ".a { border-style: solid none solid; }"],
    ["border-color with four values", ".a { border-color: red blue red blue; }"],
    ["scroll-margin with four values", ".a { scroll-margin: 0 0 0 0; }"],
    ["border-radius with two values", ".a { border-radius: 0 var(--r); }"],
    ["border-radius with an elliptical radius", ".a { border-radius: var(--r) / var(--s); }"],
  ])("refuses %s, whose values are ordered by physical side", (_name, css) => {
    expect(findLayoutCssViolations(css).map((violation) => violation.rule)).toEqual([
      "physical shorthand",
    ]);
  });

  it.each([
    ["margin with one value", ".a { margin: 0; }"],
    ["margin with two values", ".a { margin: 0 auto; }"],
    ["padding with two values, each side of an axis equal", ".a { padding: var(--a) var(--b); }"],
    ["inset with one value", ".a { inset: 0; }"],
    ["a function value that holds spaces", ".a { margin: calc(var(--a) + var(--b)) auto; }"],
    ["a single radius", ".a { border-radius: var(--idg-shape-radius-md); }"],
    ["logical margins", ".a { margin-inline: 0 var(--x); }"],
  ])("accepts %s", (_name, css) => {
    expect(findLayoutCssViolations(css)).toEqual([]);
  });

  it.each([
    [".a { place-items: left; }"],
    [".a { place-items: center right; }"],
    [".a { place-content: left top; }"],
    [".a { place-self: right; }"],
  ])("refuses the physical keyword in %s", (css) => {
    expect(findLayoutCssViolations(css).map((violation) => violation.rule)).toContain(
      "physical value",
    );
  });

  it("refuses a two-value overflow, which is ordered x then y, and allows one value", () => {
    expect(findLayoutCssViolations(".a { overflow: hidden auto; }").map((v) => v.rule)).toEqual([
      "physical shorthand",
    ]);
    expect(findLayoutCssViolations(".a { overflow: clip; }")).toEqual([]);
    expect(findLayoutCssViolations(".a { overflow-block: clip; }")).toEqual([]);
  });

  it.each([
    [".a { place-self: Left; }"],
    [".a { text-align: RIGHT; }"],
    [".a { justify-content: Right; }"],
    [".a { float: LEFT; }"],
  ])("refuses a physical keyword in any case in %s", (css) => {
    expect(findLayoutCssViolations(css).map((violation) => violation.rule)).toContain(
      "physical value",
    );
  });

  it.each([
    [".a { float: inline-start; }"],
    [".a { float: inline-end; }"],
    [".a { clear: inline-start; }"],
    [".a { clear: inline-end; }"],
    [".a { float: none; }"],
  ])("accepts the logical float or clear in %s", (css) => {
    expect(findLayoutCssViolations(css)).toEqual([]);
  });

  it.each([[".a { clear: left; }"], [".a { clear: right; }"], [".a { float: right; }"]])(
    "still refuses the physical float or clear in %s",
    (css) => {
      expect(findLayoutCssViolations(css).map((violation) => violation.rule)).toEqual([
        "physical value",
      ]);
    },
  );

  it.each([
    ["a container query", "@container (orientation: landscape) { .a { display: block; } }"],
    [
      "a media query",
      "@media (prefers-reduced-motion: reduce) and (min-resolution: 2dppx) { .a { gap: 0; } }",
    ],
  ])("accepts %s that holds no length", (_name, css) => {
    expect(
      findLayoutCssViolations(css).filter((violation) => violation.rule === "hard-coded length"),
    ).toEqual([]);
  });

  it.each([
    ["a container query", "@container (inline-size < 30rem) { .a { display: block; } }"],
    ["a named container query", "@container card (min-inline-size: 400px) { .a { gap: 0; } }"],
    [
      "a media query",
      "@media (forced-colors: active) and (min-resolution: 2x) and (hover: 1px) { .a { gap: 0; } }",
    ],
    ["a range container query", "@container (20em <= inline-size <= 40em) { .a { gap: 0; } }"],
  ])("refuses a length in the prelude of %s", (_name, css) => {
    const rules = findLayoutCssViolations(css).map((violation) => violation.rule);
    expect(rules).toContain("hard-coded length");
  });

  it.each([
    [".a { clip-path: inset(0 var(--x) 0 var(--y)); }"],
    [".a { clip-path: inset(1fr 2fr 3fr); }"],
    [
      ".a { clip-path: inset(var(--a) calc(var(--b) + var(--c)) var(--d) var(--e) round var(--r)); }",
    ],
  ])("refuses an inset() clip with more than two values in %s", (css) => {
    expect(findLayoutCssViolations(css).map((violation) => violation.rule)).toEqual([
      "physical shorthand",
    ]);
  });

  it.each([
    [".a { clip-path: rect(0 var(--a) var(--b) 0); }"],
    [".a { clip-path: rect(auto auto auto auto); }"],
    [".a { clip-path: xywh(0 0 var(--w) var(--h)); }"],
    [".a { shape-outside: inset(0 var(--a) var(--b)); }"],
    [".a { shape-outside: xywh(0 0 50% 50%); }"],
    [".a { clip: rect(0, var(--a), var(--b), 0); }"],
    [".a { clip-path: inset(0 round var(--r) var(--s)); }"],
    [".a { clip-path: inset(0 round var(--r) / var(--s)); }"],
    [".a { shape-outside: inset(0 round var(--r) var(--s)); }"],
  ])("refuses a physically ordered shape in %s", (css) => {
    expect(findLayoutCssViolations(css).length).toBeGreaterThan(0);
  });

  it.each([
    [".a { shape-outside: inset(0 var(--a)); }"],
    [".a { shape-outside: inset(0 round var(--r)); }"],
    [".a { shape-outside: circle(50%); }"],
  ])("accepts the shape in %s", (css) => {
    expect(findLayoutCssViolations(css)).toEqual([]);
  });

  it("refuses an orientation media query, which is the viewport's, and allows it in a container query", () => {
    expect(
      findLayoutCssViolations("@media (orientation: portrait) { .a { gap: 0; } }").map(
        (violation) => violation.rule,
      ),
    ).toEqual(["viewport media query"]);
    expect(
      findLayoutCssViolations("@container (orientation: portrait) { .a { gap: 0; } }"),
    ).toEqual([]);
  });

  it.each([
    [`.a::before { content: '@media (min-width: 0) {'; }`],
    [`.a::before { content: "@container (inline-size < 30em) {"; }`],
    [`.a::before { content: "10px left"; }`],
  ])("does not read a string as css in %s", (css) => {
    expect(findLayoutCssViolations(css)).toEqual([]);
  });

  it.each([
    [".a { clip-path: inset(0); }"],
    [".a { clip-path: inset(var(--a) var(--b)); }"],
    [".a { clip-path: inset(0 round var(--r)); }"],
    [".a { clip-path: none; }"],
  ])("accepts an inset() clip with one or two values in %s", (css) => {
    expect(findLayoutCssViolations(css)).toEqual([]);
  });

  it("does not count !important as a value", () => {
    expect(findLayoutCssViolations(".a { margin: 0 auto !important; }")).toEqual([]);
    expect(
      findLayoutCssViolations(".a { margin: 0 auto 0 !important; }").map((v) => v.rule),
    ).toEqual(["physical shorthand"]);
    expect(findLayoutCssViolations(".a { margin:0 auto!important; }")).toEqual([]);
  });

  it("counts adjacent functions as separate values", () => {
    expect(
      findLayoutCssViolations(".a { margin: var(--a)var(--b)var(--c)var(--d); }").map(
        (v) => v.rule,
      ),
    ).toEqual(["physical shorthand"]);
    expect(findLayoutCssViolations(".a { margin: var(--a)var(--b); }")).toEqual([]);
  });

  it.each([
    [".a { justify-content: left; }"],
    [".a { justify-content: right; }"],
    [".a { justify-items: right; }"],
    [".a { justify-self: left; }"],
    [".a { justify-self: safe right; }"],
    [".a { float: left; }"],
  ])("refuses the physical keyword in %s", (css) => {
    const rules = findLayoutCssViolations(css).map((violation) => violation.rule);
    expect(rules).toContain("physical value");
  });

  it.each([".a { justify-content: flex-start; }", ".a { justify-items: start; }"])(
    "accepts the logical keyword in %s",
    (css) => {
      expect(findLayoutCssViolations(css)).toEqual([]);
    },
  );

  it("allows a forced-colors media query, which is not a viewport one", () => {
    expect(
      findLayoutCssViolations(
        "@media (forced-colors: active) { .a { border-color: CanvasText; } }",
      ),
    ).toEqual([]);
  });

  it("ignores comments", () => {
    expect(findLayoutCssViolations("/* 20rem, margin-left and 8px */ .a { gap: 0; }")).toEqual([]);
  });
});

describe("container query thresholds", () => {
  // A container query cannot take a custom property, so a page shell that changes arrangement with
  // its container must write the threshold out. The checker takes the sizes of the token scale and
  // lets a threshold be exactly one of them, so it cannot drift to an arbitrary length.
  const options = { containerSizes: ["40rem", "56rem"] };

  it.each([
    "@container (min-inline-size: 40rem) { .a { gap: 0; } }",
    "@container idg-shell (inline-size >= 56rem) { .a { gap: 0; } }",
    "@container (40rem <= inline-size < 56rem) { .a { gap: 0; } }",
    "@container style(--idg-layout-shell: top-bar) and (min-inline-size: 40rem) { .a { gap: 0; } }",
  ])("accepts a threshold that is a size of the scale in %s", (css) => {
    expect(findLayoutCssViolations(css, options)).toEqual([]);
  });

  it.each([
    ["a length that is not on the scale", "@container (min-inline-size: 41rem) { .a { gap: 0; } }"],
    ["the same size in pixels", "@container (min-inline-size: 640px) { .a { gap: 0; } }"],
    [
      "the same size written differently",
      "@container (min-inline-size: 40.0rem) { .a { gap: 0; } }",
    ],
    ["one end of a range", "@container (40rem <= inline-size < 57rem) { .a { gap: 0; } }"],
  ])("refuses %s", (_name, css) => {
    const rules = findLayoutCssViolations(css, options).map((violation) => violation.rule);
    expect(rules).toEqual(["hard-coded length"]);
  });

  it("refuses every threshold when no sizes are given", () => {
    const css = "@container (min-inline-size: 40rem) { .a { gap: 0; } }";
    expect(findLayoutCssViolations(css, { containerSizes: [] })).toHaveLength(1);
    expect(findLayoutCssViolations(css)).toHaveLength(1);
  });

  it("allows the sizes only in a container query, not in a media query or a declaration", () => {
    const rules = (css: string) =>
      findLayoutCssViolations(css, options).map((violation) => violation.rule);
    expect(rules("@media (min-width: 40rem) { .a { gap: 0; } }")).toEqual([
      "viewport media query",
      "hard-coded length",
    ]);
    expect(rules(".a { min-inline-size: 40rem; }")).toEqual(["hard-coded length"]);
  });
});

const PRIMITIVES = ["stack", "cluster", "grid", "sidebar", "switcher", "cover"];
const STYLESHEETS = [
  ...PRIMITIVES.map((name) => `../src/components/${name}/${name}.css`),
  "../src/styles/layout-gap.css",
  "../src/styles/layout-size.css",
];

describe("the layout primitives' stylesheets", () => {
  it.each(STYLESHEETS)("%s takes every length from tokens and uses logical properties", (file) => {
    const css = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
    expect(findLayoutCssViolations(css)).toEqual([]);
  });
});

type TokenGroup = Record<string, { $value?: string } | string | undefined>;

/** The sizes of the token scale as written, such as `40rem`, by step name. */
function sizeScale(): Map<string, string> {
  const source = readFileSync(
    fileURLToPath(new URL("../../tokens/src/tokens/primitive.json", import.meta.url)),
    "utf8",
  );
  const { size } = JSON.parse(source) as { size: TokenGroup };
  const scale = new Map<string, string>();
  for (const [step, token] of Object.entries(size)) {
    if (typeof token === "object" && /^\d+(?:\.\d+)?rem$/.test(token.$value ?? "")) {
      scale.set(step, token.$value ?? "");
    }
  }
  return scale;
}

describe("the page shell's stylesheet", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../src/components/layout/layout.css", import.meta.url)),
    "utf8",
  );
  const scale = sizeScale();

  it("takes every length from tokens, and compares its container only against a size of the scale", () => {
    expect(findLayoutCssViolations(css, { containerSizes: [...scale.values()] })).toEqual([]);
  });

  it("changes arrangement at the xl and 3xl steps, which are 40rem and 72rem", () => {
    expect(scale.get("xl")).toBe("40rem");
    expect(scale.get("3xl")).toBe("72rem");
    const thresholds = new Set(
      [...css.matchAll(/@container[^{]*?\b(\d+(?:\.\d+)?rem)\b/g)].map((match) => match[1]),
    );
    expect(thresholds.has("40rem")).toBe(true);
    expect(thresholds.has("72rem")).toBe(true);
    for (const threshold of thresholds) {
      expect([...scale.values()], `${threshold ?? ""} is on the scale`).toContain(threshold);
    }
  });

  it("reads the layout and the container, never the viewport", () => {
    expect(css).toMatch(/@container[^{]*style\(--idg-layout-shell: top-bar\)/);
    expect(css).not.toMatch(/@media[^{]*\b(?:width|height)\b/);
  });
});
