import { describe, expect, it } from "vitest";
import { STATIC_PAGES } from "./pages/index.ts";
import { readContentPage } from "./read-content-page.ts";

describe("a content page read from its attribute", () => {
  it("is the page the prerenderer wrote", () => {
    const [features] = STATIC_PAGES;
    const result = readContentPage(JSON.stringify(features));
    expect(result.ok && result.page).toEqual(features);
  });

  it("is refused when the attribute is not JSON", () => {
    const result = readContentPage("<p>not json</p>");
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error.message).toBe("is not JSON");
  });

  it("is refused when the JSON is not a valid page of the site", () => {
    const [features] = STATIC_PAGES;
    const page = {
      ...features,
      body: [{ type: "paragraph", content: [{ type: "link", href: "/nowhere/", text: "x" }] }],
    };
    expect(readContentPage(JSON.stringify(page)).ok).toBe(false);
  });
});
