import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HydrateResults, SerializeDocumentOptions } from "@stencil/core/internal";
import { bootstrapScriptAttributes } from "@identgineer/variations/bootstrap-tag";
import type { ContentPage } from "../src/content/content-page.ts";
import { STATIC_PAGES } from "../src/content/pages/index.ts";
import { NO_LABELS, type NavigationLabels } from "../src/content/navigation.ts";
import { checkReference } from "../src/reference/component-pages.ts";
import { builtReference } from "../src/reference/generated-routes.ts";
import { prerenderedPages, type PrerenderedPage } from "../src/routes.ts";
import { resolveSiteContent } from "./cms-content.ts";
import { renderDocument, type DocumentAssets } from "./document.ts";
import { pageMetadata } from "./metadata.ts";
import {
  HEADERS_FILE,
  contentSecurityPolicy,
  inlineStyles,
  securityHeaders,
  withoutStyleAttributes,
} from "./security-headers.ts";
import { prepareServerDocument } from "./server-document.ts";
import { siteUrlFrom } from "./site-url.ts";
import { robotsTxt, sitemapXml } from "./sitemap.ts";

interface HydrateModule {
  renderToString(html: string, options: SerializeDocumentOptions): Promise<HydrateResults>;
}

const SITE = fileURLToPath(new URL("..", import.meta.url));
const WWW = join(SITE, "www");
const HYDRATE = join(SITE, "hydrate", "index.mjs");

const ASSETS: DocumentAssets = {
  bootstrap: bootstrapScriptAttributes("/assets/bootstrap.js"),
  stylesheets: ["/assets/tokens.css", "/assets/site.css"],
  moduleScript: "/build/site.esm.js",
  icon: "/assets/favicon.svg",
};

async function render(
  hydrate: HydrateModule,
  page: PrerenderedPage,
  content: ContentPage | undefined,
  labels: NavigationLabels,
  siteUrl: URL,
): Promise<string> {
  const metadata = pageMetadata(page, siteUrl, content?.seo);
  const attributes: Record<string, string> = {};
  if (content !== undefined) attributes.page = JSON.stringify(content);
  // Only labels the CMS gave: with none, the page is the same byte for byte as without a CMS.
  if (labels !== NO_LABELS) attributes.navigation = JSON.stringify(labels);
  const results = await hydrate.renderToString(
    renderDocument({ metadata, component: page.component, attributes, assets: ASSETS }),
    {
      url: new URL(page.path ?? page.file, siteUrl).href,
      // Without it, Stencil takes the canonical link out of the document.
      ...(metadata.canonicalUrl === undefined ? {} : { canonicalUrl: metadata.canonicalUrl }),
      // Shadow roots are written as declarative shadow DOM, so a page is drawn and styled before,
      // and without, any script. Their styles are the only inline content, allowed by hash.
      serializeShadowRoot: "declarative-shadow-dom",
      // A fixed id keeps two builds of the same source byte for byte the same.
      buildId: "site",
      prettyHtml: false,
      removeAttributeQuotes: false,
      beforeHydrate: prepareServerDocument,
    },
  );
  const errors = results.diagnostics.filter((diagnostic) => diagnostic.level === "error");
  if (errors.length > 0 || results.html === null) {
    const messages = errors.map((error) => error.messageText).join("\n");
    throw new Error(`Prerendering ${page.file} failed:\n${messages}`);
  }
  return results.html;
}

/**
 * What Stencil's www output writes that no page loads: its dev server's settings, the loader for
 * browsers without modules, and an empty entry for the app's own index, which has no exports.
 */
const UNUSED_OUTPUT = ["host.config.json", "build/site.js", "build/index.esm.js"];

function write(file: string, content: string): void {
  const path = join(WWW, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Renders every page with the hydrate build of the Stencil app, from the CMS's content when one is
 * set and the repository's otherwise, writes each to its file in `www`, with the sitemap and
 * robots.txt, and writes the policy that allows exactly the inline styles those pages hold.
 */
async function prerender(): Promise<void> {
  const siteUrl = siteUrlFrom(process.env);
  const hydrate = (await import(pathToFileURL(HYDRATE).href)) as HydrateModule;
  const styles: string[] = [];
  const {
    pages: contents,
    labels,
    warnings,
  } = await resolveSiteContent({
    url: process.env.IDG_CMS_URL,
    staticPages: STATIC_PAGES,
  });
  for (const warning of warnings) console.warn(warning);
  // The components' pages are made from the library's own documentation and are checked before
  // anything is written; a CMS record cannot replace them.
  const reference = builtReference();
  checkReference(reference);
  const generated = reference.components.map(({ route }) => route);
  const generatedContents = new Map(
    [reference.index, ...reference.components.map(({ page }) => page)].map((page) => [
      page.slug,
      page,
    ]),
  );
  const noIndex = new Set<string>();
  const pages = prerenderedPages(generated);
  for (const page of pages) {
    const content =
      page.content === undefined
        ? undefined
        : (generatedContents.get(page.content) ?? contents.get(page.content));
    if (page.content !== undefined && content === undefined) {
      throw new Error(`${page.file} has no content page "${page.content}"`);
    }
    if (content?.seo.noIndex === true && page.path !== undefined) noIndex.add(page.path);
    const html = withoutStyleAttributes(await render(hydrate, page, content, labels, siteUrl));
    styles.push(...inlineStyles(html));
    write(page.file, html);
  }
  write("sitemap.xml", sitemapXml(siteUrl, noIndex, generated));
  write("robots.txt", robotsTxt(siteUrl));
  for (const file of UNUSED_OUTPUT) rmSync(join(WWW, file), { force: true });
  const headers = securityHeaders(contentSecurityPolicy(styles));
  write(HEADERS_FILE, `${JSON.stringify(headers, null, 2)}\n`);
  console.log(`Prerendered ${String(pages.length)} pages for ${siteUrl.href}`);
}

await prerender();
