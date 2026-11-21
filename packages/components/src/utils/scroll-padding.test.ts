import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reserveScrollPadding, releaseScrollPadding } from "./scroll-padding";

class FakeSheet {
  text = "";
  replaceSync(text: string): void {
    this.text = text;
  }
}

function fakeDocument() {
  return { adoptedStyleSheets: [] as FakeSheet[] };
}

const asDocument = (fake: ReturnType<typeof fakeDocument>) => fake as unknown as Document;

beforeEach(() => {
  vi.stubGlobal("CSSStyleSheet", FakeSheet);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reserveScrollPadding", () => {
  it("pads the top of what the page scrolls by the layout's pinned chrome", () => {
    const document = fakeDocument();
    reserveScrollPadding(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(1);
    expect(document.adoptedStyleSheets[0]?.text).toBe(
      ":root { scroll-padding-block-start: var(--idg-layout-sticky-inset); }",
    );
    releaseScrollPadding(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("adopts one sheet however many shells hold it, and drops it with the last", () => {
    const document = fakeDocument();
    reserveScrollPadding(asDocument(document));
    reserveScrollPadding(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(1);
    releaseScrollPadding(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(1);
    releaseScrollPadding(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("keeps the sheets the page already adopted", () => {
    const document = fakeDocument();
    const other = new FakeSheet();
    document.adoptedStyleSheets.push(other);
    reserveScrollPadding(asDocument(document));
    releaseScrollPadding(asDocument(document));
    expect(document.adoptedStyleSheets).toEqual([other]);
  });

  it("ignores a release that was never reserved", () => {
    const document = fakeDocument();
    releaseScrollPadding(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("does nothing where constructable stylesheets do not exist", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("CSSStyleSheet", undefined);
    const document = fakeDocument();
    reserveScrollPadding(asDocument(document));
    expect(document.adoptedStyleSheets).toHaveLength(0);
    releaseScrollPadding(asDocument(document));
  });
});
