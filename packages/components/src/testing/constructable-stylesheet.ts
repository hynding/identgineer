import { vi } from "vitest";

export interface FakeSheet {
  css: string;
}

/**
 * Stencil's mock DOM has no constructable stylesheets or adopted style sheets. A stand-in sheet is
 * installed, and the document is given an `adoptedStyleSheets` list, so a spec can see which sheet
 * a component adopted. Whether the sheet really styles the page is checked in the browser tests.
 */
export function stubConstructableStylesheets(): { sheets: () => FakeSheet[]; restore: () => void } {
  class RecordingSheet implements FakeSheet {
    css = "";

    replaceSync(css: string): void {
      this.css = css;
    }
  }
  vi.stubGlobal("CSSStyleSheet", RecordingSheet);
  const target = document as unknown as { adoptedStyleSheets?: FakeSheet[] };
  target.adoptedStyleSheets = [];
  return {
    sheets: () => target.adoptedStyleSheets ?? [],
    restore: () => {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(target, "adoptedStyleSheets");
    },
  };
}
