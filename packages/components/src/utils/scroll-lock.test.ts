import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockScroll, unlockScroll } from "./scroll-lock";

class FakeSheet {
  text = "";
  replaceSync(text: string): void {
    this.text = text;
  }
}

function fakeDocument(scrollbarWidth: number) {
  return {
    adoptedStyleSheets: [] as FakeSheet[],
    documentElement: { clientWidth: 1000 - scrollbarWidth },
    defaultView: { innerWidth: 1000 },
  };
}

type FakeDocument = ReturnType<typeof fakeDocument>;
const asDocument = (fake: FakeDocument) => fake as unknown as Document;

beforeEach(() => {
  vi.stubGlobal("CSSStyleSheet", FakeSheet);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lockScroll", () => {
  it("hides the page's overflow and keeps the gutter of a scrollbar that takes space", () => {
    const document = fakeDocument(15);
    lockScroll(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(1);
    expect(document.adoptedStyleSheets[0]?.text).toContain("overflow: hidden");
    expect(document.adoptedStyleSheets[0]?.text).toContain("scrollbar-gutter: stable");
    unlockScroll(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("reserves no gutter when the page had no scrollbar, which would shift it", () => {
    const document = fakeDocument(0);
    lockScroll(asDocument(document));
    expect(document.adoptedStyleSheets[0]?.text).not.toContain("scrollbar-gutter");
    unlockScroll(asDocument(document));
  });

  it("unlocks only when the last holder lets go", () => {
    const document = fakeDocument(15);
    lockScroll(asDocument(document));
    lockScroll(asDocument(document));
    unlockScroll(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(1);
    unlockScroll(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("keeps the page's own adopted sheets", () => {
    const document = fakeDocument(0);
    const own = new FakeSheet();
    document.adoptedStyleSheets = [own];
    lockScroll(asDocument(document));
    unlockScroll(asDocument(document));
    expect(document.adoptedStyleSheets).toEqual([own]);
  });
});
