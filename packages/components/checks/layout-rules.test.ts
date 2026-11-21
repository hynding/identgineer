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
      @container (inline-size < 30em) { .e { display: block; } }
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
      "@media (min-width: 40em) { .a { display: block; } }",
      "viewport media query",
    ],
    [
      "a viewport height query",
      "@media (max-height: 30em) { .a { display: block; } }",
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

  it.each(["0", "0px", "0.0rem", "-0em", "0e3px"])(
    "accepts the zero %s, which is a length with no size to hard-code",
    (zero) => {
      expect(findLayoutCssViolations(`.a { --_gap: ${zero}; }`)).toEqual([]);
    },
  );

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
