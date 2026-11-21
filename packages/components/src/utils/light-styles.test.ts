import { describe, expect, it } from "vitest";
import { adoptStyles, type StyleRoot } from "./light-styles";

const sheet = (name: string) => ({ name }) as unknown as CSSStyleSheet;
const rootWith = (...sheets: CSSStyleSheet[]): StyleRoot => ({ adoptedStyleSheets: sheets });

describe("adoptStyles", () => {
  it("adds the sheet to the root", () => {
    const root = rootWith();
    const css = sheet("table");
    adoptStyles(root, css);
    expect(root.adoptedStyleSheets).toEqual([css]);
  });

  it("keeps the sheets the page already adopted", () => {
    const own = sheet("page");
    const root = rootWith(own);
    const css = sheet("table");
    adoptStyles(root, css);
    expect(root.adoptedStyleSheets).toEqual([own, css]);
  });

  it("adds the sheet once however many users adopt it, and removes it with the last", () => {
    const root = rootWith();
    const css = sheet("table");
    const releaseFirst = adoptStyles(root, css);
    const releaseSecond = adoptStyles(root, css);
    expect(root.adoptedStyleSheets).toEqual([css]);
    releaseFirst();
    expect(root.adoptedStyleSheets).toEqual([css]);
    releaseSecond();
    expect(root.adoptedStyleSheets).toEqual([]);
  });

  it("releases only once, however often the release is called", () => {
    const root = rootWith();
    const css = sheet("table");
    const releaseFirst = adoptStyles(root, css);
    adoptStyles(root, css);
    releaseFirst();
    releaseFirst();
    expect(root.adoptedStyleSheets).toEqual([css]);
  });

  it("counts each root separately", () => {
    const first = rootWith();
    const second = rootWith();
    const css = sheet("table");
    const release = adoptStyles(first, css);
    adoptStyles(second, css);
    release();
    expect(first.adoptedStyleSheets).toEqual([]);
    expect(second.adoptedStyleSheets).toEqual([css]);
  });

  it("can adopt again after everything was released", () => {
    const root = rootWith();
    const css = sheet("table");
    adoptStyles(root, css)();
    adoptStyles(root, css);
    expect(root.adoptedStyleSheets).toEqual([css]);
  });
});
