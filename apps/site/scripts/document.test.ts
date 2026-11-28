import { describe, expect, it } from "vitest";
import { renderDocument, type DocumentAssets } from "./document";
import type { PageMetadata } from "./metadata";

const ASSETS: DocumentAssets = {
  bootstrap: { src: "/assets/bootstrap.js", integrity: "sha384-abc" },
  stylesheets: ["/assets/tokens.css", "/assets/site.css"],
  moduleScript: "/build/site.esm.js",
  icon: "/favicon.svg",
};

const METADATA: PageMetadata = {
  title: "Docs · Identgineer",
  description: "How to adopt it.",
  canonicalUrl: "https://identgineer.dev/docs/",
  robots: undefined,
  openGraph: [
    ["og:type", "website"],
    ["og:url", "https://identgineer.dev/docs/"],
  ],
  themeColors: { light: "#f7f7fd", dark: "#0d0b26" },
};

const html = renderDocument({ metadata: METADATA, component: "site-home", assets: ASSETS });
const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));

function position(fragment: string): number {
  const index = html.indexOf(fragment);
  if (index < 0) throw new Error(`${fragment} is not in the document`);
  return index;
}

describe("the document a page is rendered from", () => {
  it("is an English HTML5 document with a charset and a viewport", () => {
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(head).toContain('<meta charset="utf-8">');
    expect(head).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it("runs the variation bootstrap first, blocking and checked by its integrity", () => {
    expect(head).toContain('<script src="/assets/bootstrap.js" integrity="sha384-abc"></script>');
    expect(position("/assets/bootstrap.js")).toBeLessThan(position("/assets/tokens.css"));
    expect(position("/assets/bootstrap.js")).toBeLessThan(position("<title>"));
    expect(head).not.toMatch(/bootstrap\.js"[^>]*(?:async|defer|type=)/);
  });

  it("links every stylesheet as a render-blocking link, tokens first", () => {
    expect(head).toContain('<link rel="stylesheet" href="/assets/tokens.css">');
    expect(head).toContain('<link rel="stylesheet" href="/assets/site.css">');
    expect(position("/assets/tokens.css")).toBeLessThan(position("/assets/site.css"));
  });

  it("loads the components as a module after the stylesheets", () => {
    expect(head).toContain('<script type="module" src="/build/site.esm.js"></script>');
    expect(position("/assets/site.css")).toBeLessThan(position("/build/site.esm.js"));
  });

  it("names the page, describes it and points at its canonical address", () => {
    expect(head).toContain("<title>Docs · Identgineer</title>");
    expect(head).toContain('<meta name="description" content="How to adopt it.">');
    expect(head).toContain('<link rel="canonical" href="https://identgineer.dev/docs/">');
    expect(head).toContain('<meta property="og:url" content="https://identgineer.dev/docs/">');
  });

  it("gives a theme colour for each scheme and an SVG icon", () => {
    expect(head).toContain(
      '<meta name="theme-color" content="#f7f7fd" media="(prefers-color-scheme: light)">',
    );
    expect(head).toContain(
      '<meta name="theme-color" content="#0d0b26" media="(prefers-color-scheme: dark)">',
    );
    expect(head).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
  });

  it("holds nothing in the body but the page's component", () => {
    expect(html).toContain("<body><site-home></site-home></body>");
  });

  it("leaves out the canonical link and asks not to be indexed where the metadata says so", () => {
    const notFound = renderDocument({
      metadata: { ...METADATA, canonicalUrl: undefined, robots: "noindex" },
      component: "site-not-found",
      assets: ASSETS,
    });
    expect(notFound).not.toContain('rel="canonical"');
    expect(notFound).toContain('<meta name="robots" content="noindex">');
  });

  it("escapes text and attribute values", () => {
    const hostile = renderDocument({
      metadata: { ...METADATA, title: "</title><script>", description: '"><b>&' },
      component: "site-home",
      assets: ASSETS,
    });
    expect(hostile).toContain("<title>&lt;/title&gt;&lt;script&gt;</title>");
    expect(hostile).toContain('content="&quot;&gt;&lt;b&gt;&amp;"');
    expect(hostile).not.toContain("<script>");
  });
});

describe("the page's component", () => {
  it("is the body's one element, without attributes when it needs none", () => {
    expect(html).toContain("<body><site-home></site-home></body>");
  });

  it("carries the attributes it is given, escaped, so a value can never close the tag", () => {
    const page = JSON.stringify({ title: `"><script>alert('x')</script>&` });
    const rendered = renderDocument({
      metadata: METADATA,
      component: "site-content-page",
      attributes: { page },
      assets: ASSETS,
    });
    expect(rendered).toContain(
      '<body><site-content-page page="{&quot;title&quot;:&quot;\\&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot;}"></site-content-page></body>',
    );
    expect(rendered).not.toContain("<script>alert");
  });
});
