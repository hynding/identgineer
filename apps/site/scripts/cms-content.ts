import type { ContentPage } from "../src/content/content-page.ts";
import { NO_LABELS, navigationPaths, type NavigationLabels } from "../src/content/navigation.ts";
import {
  describeContentError,
  parseContentPage,
  parseNavigationItem,
} from "../src/content/validate-content-page.ts";
import { livePaths } from "../src/routes.ts";
import { StrapiBlocksError, bodyFromStrapiBlocks } from "./strapi-blocks.ts";

/** How much of the CMS the build reads, at most. */
export const CMS_LIMITS = {
  /** For each request, and for the whole read together. */
  timeoutMs: 10_000,
  /** The bytes of one answer. */
  answerBytes: 1_048_576,
  /** The records of one answer. */
  pageSize: 25,
  /** The answers read of one collection: 100 records. */
  pages: 4,
} as const;

/** What the build draws: each reading page by slug, the navigation's labels, and what fell back. */
export interface SiteContent {
  readonly pages: ReadonlyMap<string, ContentPage>;
  readonly labels: NavigationLabels;
  readonly warnings: readonly string[];
}

export interface ContentOptions {
  /** `IDG_CMS_URL`: the CMS's address, or nothing for the repository's pages alone. */
  readonly url: string | undefined;
  readonly staticPages: readonly ContentPage[];
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The CMS's address as a base for its API's paths, or why it is not used. */
export function cmsBaseUrl(
  value: string,
): { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly reason: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: `${JSON.stringify(value)} is not an address` };
  }
  const local = url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (url.protocol !== "https:" && !local) {
    return { ok: false, reason: "https: is required, or http: on localhost" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "an address with credentials is refused" };
  }
  if (url.search !== "" || url.hash !== "" || value.includes("?") || value.includes("#")) {
    return { ok: false, reason: "an address with a query or a fragment is refused" };
  }
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return { ok: true, url };
}

class ReadFailure extends Error {}

/** The body of an answer, read no further than the bound, whatever the answer says of its size. */
async function boundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  const tooLarge = `the CMS answered more than ${String(CMS_LIMITS.answerBytes)} bytes`;
  if (declared > CMS_LIMITS.answerBytes) {
    await response.body?.cancel();
    throw new ReadFailure(tooLarge);
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CMS_LIMITS.answerBytes) {
      await reader.cancel();
      throw new ReadFailure(tooLarge);
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

interface Collection {
  readonly records: readonly unknown[];
  readonly truncated: boolean;
}

/**
 * Every record of a collection, answer after answer, no more than the bound: a GET without
 * credentials that follows no redirect, under one deadline for the whole read.
 */
async function readCollection(
  base: URL,
  path: string,
  query: Readonly<Record<string, string>>,
  fetcher: typeof fetch,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Collection> {
  const records: unknown[] = [];
  for (let current = 1; current <= CMS_LIMITS.pages; current += 1) {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    url.searchParams.set("pagination[page]", String(current));
    url.searchParams.set("pagination[pageSize]", String(CMS_LIMITS.pageSize));
    let response: Response;
    try {
      response = await fetcher(url.href, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "error",
        signal,
      });
    } catch {
      if (signal.aborted) {
        throw new ReadFailure(`the CMS did not answer within ${String(timeoutMs)} ms`);
      }
      throw new ReadFailure("the CMS could not be reached, or redirected the request");
    }
    if (
      response.redirected ||
      (response.url !== "" && new URL(response.url).origin !== base.origin)
    ) {
      await response.body?.cancel();
      throw new ReadFailure("the request was redirected");
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new ReadFailure(`the CMS answered ${String(response.status)}`);
    }
    const type =
      (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (type !== "application/json") {
      await response.body?.cancel();
      throw new ReadFailure(`the CMS answered ${type === "" ? "no content type" : type}, not JSON`);
    }
    let answer: unknown;
    try {
      answer = JSON.parse(await boundedText(response));
    } catch (error) {
      if (error instanceof ReadFailure) throw error;
      throw new ReadFailure("the CMS answered something that is not JSON");
    }
    const { data, meta } = (answer ?? {}) as { data?: unknown; meta?: unknown };
    if (!Array.isArray(data)) {
      throw new ReadFailure("the CMS answered something that is not a page of records");
    }
    records.push(...(data as unknown[]));
    const pageCount = (meta as { pagination?: { pageCount?: unknown } } | undefined)?.pagination
      ?.pageCount;
    const last = typeof pageCount !== "number" || current >= pageCount;
    if (last) return { records, truncated: false };
  }
  return { records, truncated: true };
}

function field(record: Record<string, unknown>, key: string): unknown {
  const value = record[key];
  return value === null ? undefined : value;
}

/** A Page record of the CMS in the shape of a content page, for the validator to judge. */
function candidateOf(record: Record<string, unknown>): Record<string, unknown> {
  const seoRecord = field(record, "seo");
  const seo: Record<string, unknown> = {};
  if (isRecord(seoRecord)) {
    for (const key of ["metaTitle", "metaDescription", "noIndex"]) {
      const value = field(seoRecord, key);
      if (value !== undefined) seo[key] = value;
    }
  }
  const candidate: Record<string, unknown> = {
    slug: field(record, "slug"),
    title: field(record, "title"),
    body: bodyFromStrapiBlocks(field(record, "body")),
    seo,
  };
  const summary = field(record, "summary");
  if (summary !== undefined) candidate.summary = summary;
  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pagesFrom(
  records: readonly unknown[],
  staticPages: readonly ContentPage[],
  warnings: string[],
): Map<string, ContentPage> {
  const known = new Set(staticPages.map((page) => page.slug));
  const paths = livePaths();
  const found = new Map<string, ContentPage>();
  records.forEach((record, index) => {
    const slug = isRecord(record) && typeof record.slug === "string" ? record.slug : undefined;
    const name =
      slug === undefined ? `record ${String(index + 1)}` : `page ${JSON.stringify(slug)}`;
    if (!isRecord(record) || slug === undefined) {
      warnings.push(`CMS: ${name} has no slug; it is left out`);
      return;
    }
    // The public API answers published pages only; one without a date of publication is a draft,
    // and is never drawn, whatever the CMS sent.
    if (typeof record.publishedAt !== "string" || record.publishedAt === "") {
      warnings.push(`CMS: ${name} is not published; it is left out`);
      return;
    }
    if (!known.has(slug)) {
      warnings.push(`CMS: ${name} is no page of the site; it is left out`);
      return;
    }
    if (found.has(slug)) {
      warnings.push(`CMS: ${name} is there twice; the first is used`);
      return;
    }
    let reason: string;
    try {
      const result = parseContentPage(candidateOf(record), { paths });
      if (result.ok) {
        found.set(slug, result.page);
        return;
      }
      reason = describeContentError(result.error);
    } catch (error) {
      if (!(error instanceof StrapiBlocksError)) throw error;
      reason = `${name}, ${error.message}`;
    }
    warnings.push(`CMS: ${name} is not valid (${reason}); the static copy is used`);
  });
  return found;
}

function labelsFrom(records: readonly unknown[], warnings: string[]): NavigationLabels {
  const paths = navigationPaths();
  const header: Record<string, string> = {};
  const footer: Record<string, string> = {};
  records.forEach((record, index) => {
    const name = `navigation item ${String(index + 1)}`;
    const candidate = isRecord(record)
      ? {
          label: field(record, "label"),
          href: field(record, "href"),
          placement: field(record, "placement"),
          order: field(record, "order"),
        }
      : record;
    const result = parseNavigationItem(candidate, paths);
    if (!result.ok) {
      warnings.push(`CMS: ${name} is not valid (${result.message}); it is left out`);
      return;
    }
    const { href, label, placement } = result.item;
    if (placement === "header") header[href] = label;
    else if (placement === "footer") footer[href] = label;
  });
  return { header, footer };
}

/**
 * The content the site is built from. With no CMS set, the repository's pages, and no request is
 * made. With one, its published pages and navigation items, each checked as the repository's
 * are, in place of the static copy of the same slug; anything that cannot be read or is not valid
 * falls back to the static copy with a warning that names it. It never throws for the CMS's sake.
 */
export async function resolveSiteContent(options: ContentOptions): Promise<SiteContent> {
  const { url, staticPages } = options;
  const statics = new Map(staticPages.map((page) => [page.slug, page]));
  if (url === undefined || url.trim() === "") {
    return { pages: statics, labels: NO_LABELS, warnings: [] };
  }
  const warnings: string[] = [];
  const base = cmsBaseUrl(url.trim());
  if (!base.ok) {
    warnings.push(
      `CMS: IDG_CMS_URL is not used (${base.reason}); the static copy of every page is used`,
    );
    return { pages: statics, labels: NO_LABELS, warnings };
  }
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? CMS_LIMITS.timeoutMs;
  const signal = AbortSignal.timeout(timeoutMs);

  const pages = new Map(statics);
  try {
    const { records, truncated } = await readCollection(
      base.url,
      "api/pages",
      { status: "published", "populate[seo]": "true" },
      fetcher,
      signal,
      timeoutMs,
    );
    if (truncated) {
      warnings.push(
        `CMS: pages has more than ${String(CMS_LIMITS.pages)} pages of records; the rest are not read`,
      );
    }
    const found = pagesFrom(records, staticPages, warnings);
    for (const slug of statics.keys()) {
      const page = found.get(slug);
      if (page) pages.set(slug, page);
      else if (!warnings.some((line) => line.includes(`page ${JSON.stringify(slug)} `))) {
        warnings.push(`CMS: no published page ${JSON.stringify(slug)}; the static copy is used`);
      }
    }
  } catch (error) {
    if (!(error instanceof ReadFailure)) throw error;
    warnings.push(
      `CMS: pages could not be read (${error.message}); the static copy of every page is used`,
    );
  }

  let labels = NO_LABELS;
  try {
    const { records } = await readCollection(
      base.url,
      "api/navigation-items",
      {},
      fetcher,
      signal,
      timeoutMs,
    );
    labels = labelsFrom(records, warnings);
  } catch (error) {
    if (!(error instanceof ReadFailure)) throw error;
    warnings.push(
      `CMS: navigation items could not be read (${error.message}); the route table's labels are used`,
    );
  }
  return { pages, labels, warnings };
}
