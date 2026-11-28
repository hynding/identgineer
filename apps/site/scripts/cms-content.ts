import type { ContentPage } from "../src/content/content-page.ts";
import { NO_LABELS, navigationPaths, type NavigationLabels } from "../src/content/navigation.ts";
import {
  describeContentProblem,
  parseContentPage,
  isSlug,
  parseNavigationItem,
  printable,
  type NavigationItem,
} from "../src/content/validate-content-page.ts";
import { ROUTES, livePaths } from "../src/routes.ts";
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
  /** The checks a record is read with; the real ones unless a test puts its own in their place. */
  readonly parsePage?: typeof parseContentPage;
  readonly parseNavigationItem?: typeof parseNavigationItem;
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
    // The value is never printed: an address the parser refuses may still hold a token.
    return { ok: false, reason: "it is not an address" };
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

/** A failed read's own reason; any other error's text is not printed, as it may echo the CMS. */
function reasonOf(error: unknown): string {
  return error instanceof ReadFailure ? error.message : "its answer could not be read";
}

/**
 * What a read gives, or the deadline's reason once it has passed, whichever comes first. Node's
 * fetch can leave a read of a body pending after its signal aborts, so the deadline is not left to
 * it.
 */
function beforeDeadline<T>(read: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    if (signal.aborted) abort();
    signal.addEventListener("abort", abort, { once: true });
    read.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

/** The body of an answer, read no further than the bound, whatever the answer says of its size. */
async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
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
  try {
    for (;;) {
      const { done, value } = await beforeDeadline(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > CMS_LIMITS.answerBytes) throw new ReadFailure(tooLarge);
      chunks.push(value);
    }
  } catch (error) {
    // Cancelling the body lets its connection go, which would otherwise keep the build waiting.
    reader.cancel().catch(() => undefined);
    throw error;
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
      const named = type === "" ? "no content type" : printable(type, 40);
      throw new ReadFailure(`the CMS answered ${named}, not JSON`);
    }
    let answer: unknown;
    try {
      answer = JSON.parse(await boundedText(response, signal));
    } catch (error) {
      if (error instanceof ReadFailure) throw error;
      if (signal.aborted) {
        throw new ReadFailure(`the CMS did not answer within ${String(timeoutMs)} ms`);
      }
      throw new ReadFailure("the CMS answered something that is not JSON");
    }
    const { data, meta } = (answer ?? {}) as { data?: unknown; meta?: unknown };
    if (!Array.isArray(data)) {
      throw new ReadFailure("the CMS answered something that is not a page of records");
    }
    // The page size is asked for, not trusted: an answer of more is refused whole.
    if (data.length > CMS_LIMITS.pageSize) {
      throw new ReadFailure(
        `the CMS answered more than ${String(CMS_LIMITS.pageSize)} records at once`,
      );
    }
    for (const record of data as unknown[]) records.push(record);
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

/** The description the route table gives the reading page of a slug. */
function routeDescription(slug: string): string | undefined {
  for (const route of ROUTES) {
    if (route.status === "live" && route.component === "site-content-page") {
      if (route.content === slug) return route.description;
    }
  }
  return undefined;
}

/**
 * A Page record of the CMS in the shape of a content page, for the validator to judge. The CMS
 * lets an editor leave the summary out; the page then takes the route table's description, which
 * is written for that page and already says what it is about.
 */
function candidateOf(record: Record<string, unknown>, slug: string): Record<string, unknown> {
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
  const fallback = summary === undefined || summary === "" ? routeDescription(slug) : summary;
  if (fallback !== undefined) candidate.summary = fallback;
  return candidate;
}

/**
 * The most lines printed about single records and items: an answer can hold a fault in every
 * record, and fill the log.
 */
export const MOST_WARNINGS = 50;

/**
 * The build's warnings. What it said of single records and items is capped, and counted past the
 * cap; what it fell back to (a line for each page and for the navigation at most) always follows.
 */
class Warnings {
  private readonly details: string[] = [];
  private hidden = 0;
  private readonly outcomes: string[] = [];

  detail(line: string): void {
    if (this.details.length < MOST_WARNINGS) this.details.push(line);
    else this.hidden += 1;
  }

  outcome(line: string): void {
    this.outcomes.push(line);
  }

  lines(): string[] {
    const more =
      this.hidden === 0 ? [] : [`CMS: ${String(this.hidden)} more warnings are not shown`];
    return [...this.details, ...more, ...this.outcomes];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface PagesRead {
  readonly found: ReadonlyMap<string, ContentPage>;
  /** Why each page of the site that was sent was first left out, for a page not yet found. */
  readonly refused: ReadonlyMap<string, string>;
}

function pagesFrom(
  records: readonly unknown[],
  staticPages: readonly ContentPage[],
  warnings: Warnings,
  parsePage: typeof parseContentPage,
): PagesRead {
  const known = new Set(staticPages.map((page) => page.slug));
  const paths = livePaths();
  const found = new Map<string, ContentPage>();
  const refused = new Map<string, string>();
  // The first reason a page of the site is left out says what the build drew for it, so it is
  // kept back to be shown; any other line is said of one record only.
  const refuse = (slug: string | undefined, line: string): void => {
    if (slug !== undefined && known.has(slug) && !found.has(slug) && !refused.has(slug)) {
      refused.set(slug, line);
    } else warnings.detail(line);
  };
  records.forEach((record, index) => {
    let name = `record ${String(index + 1)}`;
    let slug: string | undefined;
    // Whatever a record holds, it can cost the build its own page and no more.
    try {
      if (!isRecord(record) || typeof record.slug !== "string") {
        warnings.detail(`CMS: ${name} has no slug; it is left out`);
        return;
      }
      if (!isSlug(record.slug)) {
        warnings.detail(`CMS: ${name} is no page of the site; it is left out`);
        return;
      }
      slug = record.slug;
      name = `page "${slug}"`;
      const warning = pageFrom(record, slug, { known, paths, found, parsePage });
      if (warning !== undefined) refuse(slug, `CMS: ${name} ${warning}`);
    } catch {
      refuse(slug, `CMS: ${name} could not be read; the static copy is used`);
    }
  });
  return { found, refused };
}

interface PageContext {
  readonly known: ReadonlySet<string>;
  readonly paths: ReadonlySet<string>;
  readonly found: Map<string, ContentPage>;
  readonly parsePage: typeof parseContentPage;
}

/** Takes one record's page into `found`, or says why it is left out. */
function pageFrom(
  record: Record<string, unknown>,
  slug: string,
  { known, paths, found, parsePage }: PageContext,
): string | undefined {
  // The public API answers published pages only; one without a date of publication is a draft,
  // and is never drawn, whatever the CMS sent.
  if (typeof record.publishedAt !== "string" || record.publishedAt === "") {
    return "is not published; it is left out";
  }
  if (!known.has(slug)) return "is no page of the site; it is left out";
  if (found.has(slug)) return "is there twice; the first is used";
  let reason: string;
  try {
    const result = parsePage(candidateOf(record, slug), { paths });
    if (result.ok) {
      found.set(slug, result.page);
      return undefined;
    }
    reason = describeContentProblem(result.error);
  } catch (error) {
    if (!(error instanceof StrapiBlocksError)) throw error;
    reason = error.message;
  }
  return `is not valid (${reason}); the static copy is used`;
}

interface PlacedItem {
  readonly item: NavigationItem;
  readonly index: number;
}

/**
 * The CMS's labels for the navigation. Two items may name one page in one place; the one of the
 * lowest order is used, the first of them on a tie, and every other is named in a warning.
 */
function labelsFrom(
  records: readonly unknown[],
  warnings: Warnings,
  parseItem: typeof parseNavigationItem,
): NavigationLabels {
  const paths = navigationPaths();
  const chosen = new Map<string, PlacedItem>();
  const others: PlacedItem[] = [];
  records.forEach((record, index) => {
    const name = `navigation item ${String(index + 1)}`;
    try {
      const candidate = isRecord(record)
        ? {
            label: field(record, "label"),
            href: field(record, "href"),
            placement: field(record, "placement"),
            order: field(record, "order"),
          }
        : record;
      const result = parseItem(candidate, paths);
      if (!result.ok) {
        warnings.detail(`CMS: ${name} is not valid (${result.message}); it is left out`);
        return;
      }
      const placed = { item: result.item, index };
      const key = `${result.item.placement} ${result.item.href}`;
      const held = chosen.get(key);
      if (held === undefined || placed.item.order < held.item.order) {
        if (held !== undefined) others.push(held);
        chosen.set(key, placed);
      } else {
        others.push(placed);
      }
    } catch {
      warnings.detail(`CMS: ${name} could not be read; it is left out`);
    }
  });
  for (const other of others.sort((a, b) => a.index - b.index)) {
    const { placement, href, order } = other.item;
    const held = chosen.get(`${placement} ${href}`);
    if (held === undefined) continue;
    warnings.detail(
      `CMS: navigation item ${String(other.index + 1)} is another ${placement} label for ${href} ` +
        `(order ${String(order)}, after item ${String(held.index + 1)}'s ${String(held.item.order)}); it is left out`,
    );
  }
  const header: Record<string, string> = {};
  const footer: Record<string, string> = {};
  for (const { item } of chosen.values()) {
    if (item.placement === "header") header[item.href] = item.label;
    else if (item.placement === "footer") footer[item.href] = item.label;
  }
  return { header, footer };
}

/**
 * The content the site is built from. With no CMS set, the repository's pages, and no request is
 * made. With one, its published pages and navigation items, each checked as the repository's
 * are, in place of the static copy of the same slug; anything that cannot be read or is not valid
 * falls back to the static copy with a warning that names it. It never throws for the CMS's sake.
 */
export async function resolveSiteContent(options: ContentOptions): Promise<SiteContent> {
  const statics = new Map(options.staticPages.map((page) => [page.slug, page]));
  try {
    return await readSiteContent(options, statics);
  } catch {
    // Each read already falls back on its own; this is the last guard, so a mistake of ours in
    // reading the CMS costs its content, never the build.
    return {
      pages: statics,
      labels: NO_LABELS,
      warnings: ["CMS: the CMS could not be read; the static copy of every page is used"],
    };
  }
}

async function readSiteContent(
  options: ContentOptions,
  statics: ReadonlyMap<string, ContentPage>,
): Promise<SiteContent> {
  const { url, staticPages } = options;
  if (url === undefined || url.trim() === "") {
    return { pages: statics, labels: NO_LABELS, warnings: [] };
  }
  const warnings = new Warnings();
  const base = cmsBaseUrl(url.trim());
  if (!base.ok) {
    warnings.outcome(
      `CMS: IDG_CMS_URL is not used (${base.reason}); the static copy of every page is used`,
    );
    return { pages: statics, labels: NO_LABELS, warnings: warnings.lines() };
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
      warnings.outcome(
        `CMS: pages has more than ${String(CMS_LIMITS.pages)} pages of records; the rest are not read`,
      );
    }
    const { found, refused } = pagesFrom(
      records,
      staticPages,
      warnings,
      options.parsePage ?? parseContentPage,
    );
    for (const slug of statics.keys()) {
      const page = found.get(slug);
      if (page) pages.set(slug, page);
      const reason = refused.get(slug);
      if (page && reason !== undefined) warnings.detail(reason);
      else if (!page) {
        warnings.outcome(reason ?? `CMS: no published page "${slug}"; the static copy is used`);
      }
    }
  } catch (error) {
    // Anything at all, not only a failed read: nothing the CMS sends may fail the build.
    pages.clear();
    for (const [slug, page] of statics) pages.set(slug, page);
    warnings.outcome(
      `CMS: pages could not be read (${reasonOf(error)}); the static copy of every page is used`,
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
    labels = labelsFrom(records, warnings, options.parseNavigationItem ?? parseNavigationItem);
  } catch (error) {
    warnings.outcome(
      `CMS: navigation items could not be read (${reasonOf(error)}); the route table's labels are used`,
    );
  }
  return { pages, labels, warnings: warnings.lines() };
}
