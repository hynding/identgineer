import { describe, expect, it } from "vitest";
import { NO_LABELS, navigationPaths, readNavigationLabels } from "./navigation.ts";
import { parseNavigationItem } from "./validate-content-page.ts";

const item = (fields: Record<string, unknown> = {}) => ({
  label: "Tracking",
  href: "/tracking/",
  placement: "header",
  order: 0,
  ...fields,
});

describe("a navigation item", () => {
  const paths = navigationPaths();

  it("names a page of the navigation, with a label, a placement and an order", () => {
    expect(parseNavigationItem(item({ label: "Analytics", order: 3 }), paths)).toEqual({
      ok: true,
      item: { label: "Analytics", href: "/tracking/", placement: "header", order: 3 },
    });
  });

  it.each([
    [item({ href: "/nowhere/" }), /href: "\/nowhere\/" is not a page of the site's navigation/],
    [item({ href: "/docs/theming/" }), /is not a page of the site's navigation/],
    [item({ href: "javascript:alert(1)" }), /is not a page of the site's navigation/],
    [item({ href: "https://evil.example/" }), /is not a page of the site's navigation/],
    [item({ label: "" }), /^label: /],
    [item({ label: "x".repeat(61) }), /^label: /],
    [item({ label: "Bad\u202eone" }), /^label: /],
    [item({ label: "<b>Bold</b>" }), undefined],
    [item({ placement: "sidebar" }), /^placement: /],
    [item({ order: -1 }), /^order: must be a whole number, 0 or more/],
    [item({ order: 1.5 }), /^order: /],
    [item({ extra: true }), /extra/],
    [null, /./],
    ["Tracking", /./],
  ])("%j is judged", (input, refusal) => {
    const result = parseNavigationItem(input, paths);
    if (refusal === undefined) {
      // Markup is only ever text: the label is drawn as a text node, never parsed.
      expect(result.ok).toBe(true);
      return;
    }
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toMatch(refusal);
  });
});

describe("the navigation labels a page is given", () => {
  it("are none when there are none, or what was given is not JSON", () => {
    expect(readNavigationLabels("")).toEqual(NO_LABELS);
    expect(readNavigationLabels("{")).toEqual(NO_LABELS);
    expect(readNavigationLabels("null")).toEqual(NO_LABELS);
  });

  it("keep each valid label, and leave out each that is not", () => {
    const json = JSON.stringify({
      header: { "/tracking/": "Analytics", "/nowhere/": "Lost", "/identity/": 3 },
      footer: { "/docs/": "Read the docs", "/features/": "x".repeat(61) },
      utility: { "/docs/": "Ignored" },
    });
    expect(readNavigationLabels(json)).toEqual({
      header: { "/tracking/": "Analytics" },
      footer: { "/docs/": "Read the docs" },
    });
  });
});
