import { livePaths } from "../src/routes.ts";

/**
 * The sitemap: every live page by its canonical address, in the route table's order, but those
 * asked to stay out of search. The page not found is no route, so it is never listed.
 */
export function sitemapXml(siteUrl: URL, noIndex: ReadonlySet<string>): string {
  const urls = [...livePaths()]
    .filter((path) => !noIndex.has(path))
    .map((path) => `  <url><loc>${new URL(path, siteUrl).href}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

/** robots.txt: nothing is kept from crawlers, and the sitemap is named by its full address. */
export function robotsTxt(siteUrl: URL): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", siteUrl).href}\n`;
}
