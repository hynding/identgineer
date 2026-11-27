import {
  CmsDashboardError,
  type CmsDashboardErrorCode,
  type CmsDashboardMethod,
} from "./cms-dashboard-error.ts";
import {
  DOCUMENT_ID,
  hasOnlyKeys,
  isPlainObject,
  own,
  readEvent,
  readPagination,
  readProperty,
  readSummary,
  type Pagination,
} from "./cms-dashboard-records.ts";
import type {
  CmsDashboardFetch,
  CmsDashboardSource,
  CmsDashboardSourceOptions,
  CmsEventPage,
  CmsEventQuery,
  CmsStatRange,
  CmsStatSummary,
  CmsTrackedEvent,
  CmsTrackedProperty,
} from "./cms-dashboard-types.ts";

/** The CMS's page cap (`CAMIS_REST_MAX_LIMIT` on strapi-php, `config/api.ts` on Strapi). */
export const MAX_DASHBOARD_PAGE_SIZE = 25;
/** The most properties `listProperties` follows pages for: the components' own limit. */
export const MAX_DASHBOARD_PROPERTIES = 200;
// The pages that hold that many properties: the server's pageCount never sets how many are asked.
const MAX_PROPERTY_PAGES = Math.ceil(MAX_DASHBOARD_PROPERTIES / MAX_DASHBOARD_PAGE_SIZE);

const RANGES: readonly CmsStatRange[] = ["24h", "7d", "30d"];
const SORT_FIELDS = { time: "occurredAt", name: "name" } as const;
const EVENT_FIELDS = ["name", "occurredAt", "path", "properties"];
const DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The largest answers read: a page of 25 properties, a page of 25 events at the model's limits
// (paths of 2048 characters and 32 properties of 1024 code points, every character escaped), a
// summary of 30-point series. Anything longer is not an answer of the CMS.
const MAX_PROPERTY_PAGE_BYTES = 64 * 1024;
const MAX_EVENT_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_SUMMARY_BYTES = 16 * 1024;

/** Thrown inside a call; the method wraps it into a `CmsDashboardError` that names the call. */
class Refusal extends Error {
  readonly code: CmsDashboardErrorCode;

  constructor(code: CmsDashboardErrorCode) {
    super(code);
    this.code = code;
  }
}

const invalidResponse = (): Refusal => new Refusal("invalid-response");

// The same rules as the identity SDK's base URL, restated because this package may not depend on
// that one.
function parseBaseUrl(value: unknown): URL {
  if (typeof value !== "string") throw new TypeError("baseUrl must be an absolute URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("baseUrl must be an absolute URL");
  }
  const local = url.protocol === "http:" && DEVELOPMENT_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !local) {
    throw new TypeError("baseUrl must use https: (http: is allowed for localhost only)");
  }
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new TypeError("baseUrl must not carry credentials, a query or a fragment");
  }
  return url;
}

function codeOf(error: unknown): unknown {
  try {
    return typeof error === "object" && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a fetch answered something with a numeric status and headers to read. */
function isResponseLike(value: unknown): value is Response {
  try {
    if (typeof value !== "object" || value === null) return false;
    const { status, headers } = value as { status?: unknown; headers?: unknown };
    return (
      Number.isInteger(status) &&
      typeof headers === "object" &&
      headers !== null &&
      typeof (headers as { get?: unknown }).get === "function"
    );
  } catch {
    return false;
  }
}

/** Drops a body that is not read; whatever cancelling throws or rejects with is dropped too. */
function discard(response: Response): void {
  try {
    Promise.resolve(response.body?.cancel()).catch(() => undefined);
  } catch {
    // The body is being let go of either way.
  }
}

/**
 * At most `maxBytes` of the body, cancelled as soon as it is longer; refused unless it is declared
 * as JSON, is UTF-8 and parses. `JSON.parse` makes a `__proto__` key an own property like any
 * other, so parsing pollutes nothing.
 */
const readJson = async (response: Response, maxBytes: number): Promise<unknown> => {
  const type = response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  const declared = Number(response.headers.get("Content-Length") ?? "0");
  if (type !== "application/json" || declared > maxBytes) {
    discard(response);
    throw invalidResponse();
  }
  const body = response.body;
  if (body === null) throw invalidResponse();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw invalidResponse();
      total += chunk.value.byteLength;
      if (total > maxBytes) throw invalidResponse();
      chunks.push(chunk.value);
    }
  } catch (error) {
    Promise.resolve(reader.cancel()).catch(() => undefined);
    throw error instanceof Refusal ? error : new Refusal("unavailable");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw invalidResponse();
  }
};

/** The envelope `{ data, meta? }` of every CMS answer, with nothing else beside it. */
function envelope(body: unknown): { data: unknown; meta: unknown } {
  if (!isPlainObject(body) || !hasOnlyKeys(body, ["data", "meta"])) throw invalidResponse();
  return { data: own(body, "data"), meta: own(body, "meta") };
}

/**
 * What a refused answer means. 403 and 404 are one answer for a property, so a stranger's id and a
 * missing one cannot be told apart; a list of the caller's own properties has no such id.
 */
function failureCode(status: number, aboutProperty: boolean): CmsDashboardErrorCode {
  if (status === 401) return "unauthenticated";
  if ((status === 403 || status === 404) && aboutProperty) return "not-found";
  return "unavailable";
}

interface Request {
  readonly path: string;
  readonly query: URLSearchParams;
  readonly aboutProperty: boolean;
  readonly maxBytes: number;
}

const isPage = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1;

function checkPropertyId(propertyId: unknown): string {
  if (typeof propertyId !== "string" || !DOCUMENT_ID.test(propertyId)) {
    throw new Refusal("invalid-request");
  }
  return propertyId;
}

/** The query as the CMS takes it, or a refusal: the call may come from script, which checks nothing. */
function eventQuery(propertyId: string, query: unknown): URLSearchParams {
  if (!isPlainObject(query)) throw new Refusal("invalid-request");
  const { page, pageSize, sort } = query as Partial<Record<keyof CmsEventQuery, unknown>>;
  if (!isPage(page) || !isPage(pageSize) || pageSize > MAX_DASHBOARD_PAGE_SIZE) {
    throw new Refusal("invalid-request");
  }
  let field: string = SORT_FIELDS.time;
  let direction = "desc";
  if (sort !== undefined) {
    const key = own(sort, "key");
    const order = own(sort, "direction");
    if ((key !== "time" && key !== "name") || (order !== "ascending" && order !== "descending")) {
      throw new Refusal("invalid-request");
    }
    field = SORT_FIELDS[key];
    direction = order === "ascending" ? "asc" : "desc";
  }
  const params = new URLSearchParams();
  params.append("filters[property][documentId][$eq]", propertyId);
  EVENT_FIELDS.forEach((name, index) => {
    params.append(`fields[${String(index)}]`, name);
  });
  // The id breaks ties, so a page holds the same events however often it is asked for.
  params.append("sort[0]", `${field}:${direction}`);
  params.append("sort[1]", `id:${direction}`);
  params.append("pagination[page]", String(page));
  params.append("pagination[pageSize]", String(pageSize));
  return params;
}

function rowsOf<T>(data: unknown, read: (row: unknown) => T | undefined): T[] {
  if (!Array.isArray(data)) throw invalidResponse();
  return data.map((row: unknown) => {
    const record = read(row);
    if (record === undefined) throw invalidResponse();
    return record;
  });
}

/**
 * A `DashboardSource` (the seam of `@identgineer/components`) over the CMS's authenticated API,
 * on both targets. It sends nothing of its own but what the given fetch adds (the identity SDK's
 * `authorizedFetch` adds the signed-in user's bearer token), asks only for the fields it shows, and
 * checks everything it reads back: a malformed answer rejects as `invalid-response`, never as half
 * an answer. Ownership is the CMS's: the content API answers a user's own properties and events
 * only, and the summary endpoint answers 404 for a property that is not the caller's. Keeps no
 * state between calls and caches nothing.
 */
export function createCmsDashboardSource(options: CmsDashboardSourceOptions): CmsDashboardSource {
  const base = parseBaseUrl(options.baseUrl);
  if (typeof options.fetch !== "function") throw new TypeError("fetch must be a function");
  const send: CmsDashboardFetch = options.fetch;
  const prefix = `${base.origin}${base.pathname.replace(/\/+$/, "")}`;

  const get = async (request: Request): Promise<unknown> => {
    const query = request.query.toString();
    let response: unknown;
    try {
      response = await send(`${prefix}${request.path}${query === "" ? "" : `?${query}`}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
    } catch (error) {
      // authorizedFetch refuses with code `unauthorized` when no one is signed in; anything else
      // (the network, a timeout, a URL the fetch refuses) is the CMS not answering.
      throw new Refusal(codeOf(error) === "unauthorized" ? "unauthenticated" : "unavailable");
    }
    if (!isResponseLike(response)) throw invalidResponse();
    if (response.status !== 200) {
      discard(response);
      throw new Refusal(failureCode(response.status, request.aboutProperty));
    }
    return readJson(response, request.maxBytes);
  };

  const guarded =
    <Args extends unknown[], Result>(
      method: CmsDashboardMethod,
      operation: (...args: Args) => Promise<Result>,
    ) =>
    async (...args: Args): Promise<Result> => {
      try {
        return await operation(...args);
      } catch (error) {
        // Anything else can only come from what the given fetch answered (a getter that throws).
        throw new CmsDashboardError(
          method,
          error instanceof Refusal ? error.code : "invalid-response",
        );
      }
    };

  const propertyPage = async (
    page: number,
  ): Promise<{ properties: CmsTrackedProperty[]; pagination: Pagination }> => {
    const query = new URLSearchParams();
    query.append("fields[0]", "name");
    query.append("fields[1]", "domain");
    query.append("sort[0]", "id:asc");
    query.append("pagination[page]", String(page));
    query.append("pagination[pageSize]", String(MAX_DASHBOARD_PAGE_SIZE));
    const body = await get({
      path: "/api/properties",
      query,
      aboutProperty: false,
      maxBytes: MAX_PROPERTY_PAGE_BYTES,
    });
    const { data, meta } = envelope(body);
    const properties = rowsOf(data, readProperty);
    const pagination = readPagination(
      meta,
      { page, pageSize: MAX_DASHBOARD_PAGE_SIZE },
      properties.length,
    );
    if (pagination === undefined) throw invalidResponse();
    return { properties, pagination };
  };

  /** Whether the caller may read the property: a list of no events says nothing about that. */
  const confirmProperty = async (propertyId: string): Promise<void> => {
    const query = new URLSearchParams();
    query.append("fields[0]", "name");
    const { data } = envelope(
      await get({
        path: `/api/properties/${propertyId}`,
        query,
        aboutProperty: true,
        maxBytes: MAX_PROPERTY_PAGE_BYTES,
      }),
    );
    if (own(data, "documentId") !== propertyId) throw invalidResponse();
  };

  return Object.freeze({
    listProperties: guarded("listProperties", async (): Promise<CmsTrackedProperty[]> => {
      const seen = new Map<string, CmsTrackedProperty>();
      for (let page = 1; page <= MAX_PROPERTY_PAGES; page += 1) {
        const { properties, pagination } = await propertyPage(page);
        const before = seen.size;
        for (const property of properties) {
          if (seen.size < MAX_DASHBOARD_PROPERTIES && !seen.has(property.id)) {
            seen.set(property.id, property);
          }
        }
        // A page that adds nothing (empty, or rows already seen) ends the list, whatever the
        // server says is left, so a server that answers the same page forever is asked twice.
        if (seen.size === before || seen.size >= MAX_DASHBOARD_PROPERTIES) break;
        if (page >= pagination.pageCount) break;
      }
      return [...seen.values()];
    }),

    listEvents: guarded(
      "listEvents",
      async (propertyId: string, query: CmsEventQuery): Promise<CmsEventPage> => {
        const id = checkPropertyId(propertyId);
        const params = eventQuery(id, query);
        const body = await get({
          path: "/api/events",
          query: params,
          aboutProperty: true,
          maxBytes: MAX_EVENT_PAGE_BYTES,
        });
        const { data, meta } = envelope(body);
        const events: CmsTrackedEvent[] = rowsOf(data, readEvent);
        const asked = { page: Number(params.get("pagination[page]")), pageSize: query.pageSize };
        const pagination = readPagination(meta, asked, events.length);
        if (pagination === undefined) throw invalidResponse();
        // The content API answers a stranger's property, and a missing one, with no events: only
        // the property itself can say whether it is the caller's.
        if (pagination.total === 0) await confirmProperty(id);
        return { events, total: pagination.total };
      },
    ),

    summary: guarded(
      "summary",
      async (propertyId: string, range: CmsStatRange): Promise<CmsStatSummary> => {
        const id = checkPropertyId(propertyId);
        if (!RANGES.includes(range)) throw new Refusal("invalid-request");
        const query = new URLSearchParams();
        query.append("range", range);
        const { data } = envelope(
          await get({
            path: `/api/properties/${id}/summary`,
            query,
            aboutProperty: true,
            maxBytes: MAX_SUMMARY_BYTES,
          }),
        );
        const summary = readSummary(data, id, range);
        if (summary === undefined) throw invalidResponse();
        return summary;
      },
    ),
  });
}
