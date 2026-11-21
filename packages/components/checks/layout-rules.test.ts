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
