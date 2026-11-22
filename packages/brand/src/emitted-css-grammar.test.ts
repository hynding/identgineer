import { describe, expect, it } from "vitest";
import { emitBrandThemeCss } from "./emit-brand-theme.ts";
import { readEmittedCss } from "./emitted-css-grammar.ts";
import { generateBrandTheme } from "./generate-brand-theme.ts";
import { kitFrom } from "./test-support.ts";

const SELECTORS = [
  '[data-theme="acme"]',
  '[data-theme="acme"][data-scheme="dark"]',
  '[data-theme="acme"]:not([data-scheme="light"])',
];
const css = emitBrandThemeCss(generateBrandTheme(kitFrom()));

// The reader is what proves the emitted CSS holds nothing unexpected, so it must itself refuse
// anything outside the grammar.
describe("readEmittedCss", () => {
  it("reads the real output", () => {
    expect(readEmittedCss(css, SELECTORS)).toHaveLength(4);
  });

  it.each([
    [
      "an extra rule",
      (text: string) =>
        text.replace("@layer idg.brand {", "body { display: none }\n@layer idg.brand {"),
    ],
    [
      "an unknown property",
      (text: string) => text.replace("color-scheme: light;", "display: none;"),
    ],
    [
      "an unknown custom property",
      (text: string) => text.replace("--idg-color-bg:", "--idg-evil:"),
    ],
    [
      "a colour that is not hex",
      (text: string) => text.replace(/--idg-color-bg: #[0-9a-f]{6};/, "--idg-color-bg: red;"),
    ],
    [
      "a URL",
      (text: string) => text.replace(/--idg-color-bg: #[0-9a-f]{6};/, "--idg-color-bg: url(x);"),
    ],
    [
      "a second declaration on a line",
      (text: string) => text.replace("color-scheme: light;", "color-scheme: light; color: red;"),
    ],
    ["a font that is not allowlisted", (text: string) => text.replace("Arial", '"Evil Font"')],
    [
      "an import",
      (text: string) => text.replace("@layer idg.theme {", "@import url(x);\n@layer idg.theme {"),
    ],
    [
      "an unexpected selector",
      (text: string) => text.replace('[data-theme="acme"] {', '[data-theme="acme"], body {'),
    ],
    ["a missing final newline", (text: string) => text.slice(0, -1)],
    ["an unclosed block", (text: string) => text.replace(/\}\n$/, "\n")],
  ])("refuses %s", (_label, change) => {
    const altered = change(css);
    expect(altered).not.toBe(css);
    expect(() => readEmittedCss(altered, SELECTORS)).toThrow();
  });
});
