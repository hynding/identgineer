import { describe, expect, it } from "vitest";
import { livePaths, routeOfContent } from "../src/routes.ts";
import { robotsTxt, sitemapXml } from "./sitemap.ts";

const SITE = new URL("https://identgineer.example/");

describe("the sitemap", () => {
  it("lists every live page by its canonical address, in the route table's order", () => {
    const xml = sitemapXml(SITE, new Set());
    const listed = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
    expect(listed).toEqual([...livePaths()].map((path) => new URL(path, SITE).href));
    expect(listed).toContain("https://identgineer.example/docs/theming/");
  });

  it("is a urlset of the sitemap protocol, and nothing else", () => {
    expect(sitemapXml(SITE, new Set())).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...[...livePaths()].map((path) => `  <url><loc>${new URL(path, SITE).href}</loc></url>`),
        "</urlset>",
        "",
      ].join("\n"),
    );
  });

  it("lists the generated pages after the table's, each by its canonical address", () => {
    const generated = ["idg-button", "idg-input"].flatMap((tag) => {
      const route = routeOfContent(tag);
      return route === undefined ? [] : [route];
    });
    const xml = sitemapXml(SITE, new Set(), generated);
    const listed = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
    expect(listed).toEqual([...livePaths(generated)].map((path) => new URL(path, SITE).href));
    expect(listed.slice(-2)).toEqual([
      "https://identgineer.example/components/idg-button/",
      "https://identgineer.example/components/idg-input/",
    ]);
  });

  it("leaves out the page not found, and every page asked to stay out of search", () => {
    const xml = sitemapXml(SITE, new Set(["/docs/security/"]));
    expect(xml).not.toContain("404");
    expect(xml).not.toContain("/docs/security/");
    expect(xml).toContain("/docs/theming/");
  });
});

describe("robots.txt", () => {
  it("allows every crawler everything and points to the sitemap", () => {
    expect(robotsTxt(SITE)).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://identgineer.example/sitemap.xml\n",
    );
  });
});
