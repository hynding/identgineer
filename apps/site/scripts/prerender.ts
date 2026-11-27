import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HydrateResults, SerializeDocumentOptions } from "@stencil/core/internal";
import { bootstrapScriptAttributes } from "@identgineer/variations/bootstrap-tag";
import { prerenderedPages, type PrerenderedPage } from "../src/routes.ts";
import { renderDocument, type DocumentAssets } from "./document.ts";
import { pageMetadata } from "./metadata.ts";
import {
  HEADERS_FILE,
  contentSecurityPolicy,
  inlineStyles,
  securityHeaders,
} from "./security-headers.ts";
import { prepareServerDocument } from "./server-document.ts";
import { siteUrlFrom } from "./site-url.ts";

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
  icon: "/favicon.svg",
};

async function render(
  hydrate: HydrateModule,
  page: PrerenderedPage,
  siteUrl: URL,
): Promise<string> {
  const metadata = pageMetadata(page, siteUrl);
  const results = await hydrate.renderToString(
    renderDocument({ metadata, component: page.component, assets: ASSETS }),
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

function write(file: string, content: string): void {
  const path = join(WWW, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Renders every page with the hydrate build of the Stencil app, writes each to its file in `www`,
 * and writes the policy that allows exactly the inline styles those pages hold.
 */
async function prerender(): Promise<void> {
  const siteUrl = siteUrlFrom(process.env);
  const hydrate = (await import(pathToFileURL(HYDRATE).href)) as HydrateModule;
  const styles: string[] = [];
  for (const page of prerenderedPages()) {
    const html = await render(hydrate, page, siteUrl);
    styles.push(...inlineStyles(html));
    write(page.file, html);
  }
  const headers = securityHeaders(contentSecurityPolicy(styles));
  write(HEADERS_FILE, `${JSON.stringify(headers, null, 2)}\n`);
  console.log(`Prerendered ${String(prerenderedPages().length)} pages for ${siteUrl.href}`);
}

await prerender();
