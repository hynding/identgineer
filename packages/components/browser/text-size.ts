import type { Page } from "@playwright/test";
import { test } from "./fixtures";

/**
 * The text sizes a matrix test runs at. The wide variant renders in DejaVu Sans, a wider face than
 * the design's own, as the fallback font does on a machine without it, so a bar that only fits in
 * the fixture's font is caught here and not on a machine with different metrics.
 */
export const TEXT_SIZES = [
  { label: "100%", fontSize: "100%", wide: false },
  { label: "125%", fontSize: "125%", wide: false },
  { label: "100% with wide text", fontSize: "100%", wide: true },
] as const;

/** Whether DejaVu Sans is installed here: a string is wider in it than in the fallback face. */
function hasWideFont(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const widthIn = (family: string) => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return 0;
      context.font = `32px ${family}`;
      return context.measureText("Identgineer Get started Overview").width;
    };
    return widthIn('"DejaVu Sans", sans-serif') !== widthIn('"No Such Font", sans-serif');
  });
}

export async function setTextSize(page: Page, size: (typeof TEXT_SIZES)[number]): Promise<void> {
  // Without the wide face the variant would be a silent copy of the 100% run, so the text is
  // widened by about 15% with letter spacing instead, which does not depend on any font.
  const face = size.wide ? await hasWideFont(page) : true;
  if (size.wide) {
    const note = face ? "DejaVu Sans" : "letter-spacing (DejaVu Sans is not installed)";
    const notes = test.info().annotations;
    if (!notes.some((annotation) => annotation.type === "wide-text")) {
      notes.push({ type: "wide-text", description: note });
    }
  }
  await page.evaluate(
    ({ fontSize, wide, face: installed }) => {
      document.documentElement.style.fontSize = fontSize;
      const state = window as unknown as { __wide?: CSSStyleSheet };
      state.__wide ??= new CSSStyleSheet();
      const widening = installed
        ? '--idg-font-family-body: "DejaVu Sans", sans-serif !important; --idg-font-family-display: "DejaVu Sans", sans-serif !important;'
        : "--idg-font-body-letter-spacing: 0.08em !important; --idg-font-display-letter-spacing: 0.08em !important;";
      state.__wide.replaceSync(wide ? `:root:root:root:root { ${widening} }` : "");
      if (!document.adoptedStyleSheets.includes(state.__wide)) {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, state.__wide];
      }
    },
    { fontSize: size.fontSize, wide: size.wide, face },
  );
}
