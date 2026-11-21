import { describe, expect, it } from "vitest";
import { findCssViolations } from "./css-rules";

describe("findCssViolations", () => {
  it("accepts token-driven declarations and system colour keywords", () => {
    const css = `
      .a { color: var(--idg-color-text); background: transparent; border-color: currentcolor; }
      .b { transition-duration: var(--idg-motion-duration-fast); }
      .c { animation: spin calc(var(--idg-motion-duration-slow) * 3) linear infinite; }
      .d { box-shadow: 0 0 0 1px color-mix(in srgb, var(--idg-color-text) 20%, transparent); }
      .e { border-color: ButtonText; }
    `;
    expect(findCssViolations(css)).toEqual([]);
  });

  it.each([
    ["hex", ".a { color: #fff; }"],
    ["long hex", ".a { color: #1a2b3c; }"],
    ["alpha hex", ".a { color: #1a2b3c4d; }"],
    ["rgb", ".a { color: rgb(0 0 0); }"],
    ["rgba", ".a { color: rgba(0, 0, 0, .5); }"],
    ["hsl", ".a { color: hsl(10deg 10% 10%); }"],
    ["hwb", ".a { color: hwb(10 10% 10%); }"],
    ["oklch", ".a { color: oklch(50% 0.1 20); }"],
    ["lab", ".a { color: lab(50% 10 10); }"],
    ["color()", ".a { color: color(display-p3 1 0 0); }"],
    ["uppercase function", ".a { color: RGB(0 0 0); }"],
    ["a literal inside a var fallback", ".a { color: var(--idg-color-text, #000); }"],
    [
      "a literal inside color-mix",
      ".a { color: color-mix(in srgb, #fff 50%, var(--idg-color-bg)); }",
    ],
  ])("refuses %s", (_name, css) => {
    expect(findCssViolations(css)).toHaveLength(1);
  });

  it.each([
    ["milliseconds", ".a { transition-duration: 200ms; }"],
    ["seconds", ".a { animation-duration: 1s; }"],
    ["fractional seconds", ".a { transition: all .3s ease; }"],
    ["a duration in an animation shorthand", ".a { animation: spin 1.5s linear infinite; }"],
    ["a duration inside calc", ".a { transition-duration: calc(100ms * 2); }"],
    ["a duration in a delay", ".a { animation-delay: -2s; }"],
  ])("refuses %s", (_name, css) => {
    expect(findCssViolations(css)).toHaveLength(1);
  });

  it("does not mistake selectors, at-rule preludes or other units for durations or colours", () => {
    const css = `
      .items-2s, .tab-#fff3 { margin: 2rem; }
      @container style(--idg-border-control-style: none) { .b { padding: 0.5ex; } }
      @keyframes spin { 50% { opacity: 0.2; } }
    `;
    expect(findCssViolations(css)).toEqual([]);
  });

  it("ignores comments", () => {
    expect(
      findCssViolations("/* was #fff and 200ms */ .a { color: var(--idg-color-text); }"),
    ).toEqual([]);
  });

  it("reports the line of each violation", () => {
    const css = ".a {\n  color: #fff;\n}\n.b {\n  transition-duration: 1s;\n}";
    expect(findCssViolations(css).map((violation) => violation.line)).toEqual([2, 5]);
  });
});
