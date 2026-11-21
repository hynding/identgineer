import { describe, expect, it } from "vitest";
import { pageHref } from "./page-href";

describe("pageHref", () => {
  it("puts the page number in place of the placeholder", () => {
    expect(pageHref("/items?page={page}", 3)).toBe("/items?page=3");
    expect(pageHref("/items/{page}/", 12)).toBe("/items/12/");
    expect(pageHref("https://example.com/p/{page}", 1)).toBe("https://example.com/p/1");
  });

  it("replaces every placeholder", () => {
    expect(pageHref("/a/{page}?back={page}", 2)).toBe("/a/2?back=2");
  });

  it("returns undefined without a template or a placeholder, which would give every page one url", () => {
    expect(pageHref(undefined, 2)).toBeUndefined();
    expect(pageHref("", 2)).toBeUndefined();
    expect(pageHref("/items", 2)).toBeUndefined();
  });

  it("refuses an unsafe result", () => {
    expect(pageHref("javascript:alert({page})", 2)).toBeUndefined();
    expect(pageHref("data:text/html,{page}", 2)).toBeUndefined();
    expect(pageHref(" /items/{page}", 2)).toBeUndefined();
    expect(pageHref("/items\\{page}", 2)).toBeUndefined();
  });

  it("refuses a page that is not a whole number of at least 1", () => {
    expect(pageHref("/items/{page}", 0)).toBeUndefined();
    expect(pageHref("/items/{page}", 1.5)).toBeUndefined();
    expect(pageHref("/items/{page}", Number.NaN)).toBeUndefined();
  });
});
