import { DEFAULT_THEME_ID, THEMES } from "@identgineer/tokens";
import { describe, expect, it } from "vitest";
import { SITE_NAME, pageMetadata } from "./metadata";
import { prerenderedPages, type PrerenderedPage } from "../src/routes";

const SITE = new URL("https://identgineer.dev/");

function page(file: string): PrerenderedPage {
  const found = prerenderedPages().find((candidate) => candidate.file === file);
  if (!found) throw new Error(`no prerendered page ${file}`);
  return found;
}

const docs: PrerenderedPage = {
  file: "docs/index.html",
  path: "/docs/",
  component: "site-home",
  title: "Documentation",
  description: "How to adopt it.",
};

describe("page metadata", () => {
  it("uses the home page's title as it is, since it already names the site", () => {
    expect(pageMetadata(page("index.html"), SITE).title).toBe(page("index.html").title);
  });

  it("adds the site's name to every other title", () => {
    expect(pageMetadata(docs, SITE).title).toBe(`Documentation · ${SITE_NAME}`);
    expect(pageMetadata(page("404.html"), SITE).title).toBe(`Page not found · ${SITE_NAME}`);
  });

  it("carries the route's description", () => {
    expect(pageMetadata(docs, SITE).description).toBe("How to adopt it.");
  });

  it("builds the canonical URL on the site's address", () => {
    expect(pageMetadata(page("index.html"), SITE).canonicalUrl).toBe("https://identgineer.dev/");
    expect(pageMetadata(docs, SITE).canonicalUrl).toBe("https://identgineer.dev/docs/");
  });

  it("gives the not found page no canonical URL and keeps it out of search results", () => {
    const metadata = pageMetadata(page("404.html"), SITE);
    expect(metadata.canonicalUrl).toBeUndefined();
    expect(metadata.robots).toBe("noindex");
  });

  it("lets every real page be indexed", () => {
    expect(pageMetadata(docs, SITE).robots).toBeUndefined();
  });

  it("gives the Open Graph basics, with the URL only where there is a canonical one", () => {
    expect(pageMetadata(docs, SITE).openGraph).toEqual([
      ["og:type", "website"],
      ["og:site_name", SITE_NAME],
      ["og:title", `Documentation · ${SITE_NAME}`],
      ["og:description", "How to adopt it."],
      ["og:url", "https://identgineer.dev/docs/"],
    ]);
    const notFound = pageMetadata(page("404.html"), SITE).openGraph;
    expect(notFound.map(([property]) => property)).not.toContain("og:url");
  });

  it("takes the theme colours from the default theme's backgrounds in both schemes", () => {
    const theme = THEMES.find((candidate) => candidate.id === DEFAULT_THEME_ID);
    expect(pageMetadata(docs, SITE).themeColors).toEqual({
      light: theme?.swatches.light.bg,
      dark: theme?.swatches.dark.bg,
    });
  });
});
