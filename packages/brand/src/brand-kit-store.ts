import type { BrandKit } from "./brand-kit.ts";
import { BrandKitStoreError, type BrandKitStoreErrorCode } from "./brand-kit-store-error.ts";
import {
  brandKitToCms,
  CMS_FIELDS,
  DOCUMENT_ID,
  parseCmsBrandKit,
  readCmsBrandKit,
  readCmsBrandKitSummary,
  SUMMARY_FIELDS,
  type BrandKitRecordFailure,
  type BrandKitRecordResult,
  type BrandKitSummaryResult,
  type StoredBrandKit,
} from "./cms-brand-kit.ts";
import { discardBody, isAborted, readFailureBody, readJsonAnswer } from "./read-cms-answer.ts";
import { parseRetryAfter } from "./retry-after.ts";
import { parseStoreBaseUrl, storeEndpoint } from "./store-base-url.ts";

/** The `fetch` the store sends with; the identity SDK's `authorizedFetch` is one. */
export type BrandKitFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface BrandKitStoreOptions {
  /** The CMS's address: `https:`, or `http:` on localhost. */
  readonly baseUrl: string;
  /** Sends the signed-in user's requests, with their credentials: `authorizedFetch` in production. */
  readonly fetch: BrandKitFetch;
  /** Sends `listPublic` and `getPublic`, which carry no credentials. The global `fetch` if left out. */
  readonly publicFetch?: BrandKitFetch;
}

export interface BrandKitRequestOptions {
  /** Aborts the request, which then rejects as a `network` error. */
  readonly signal?: AbortSignal;
}

export interface BrandKitListOptions extends BrandKitRequestOptions {
  /** From 1; 1 by default. */
  readonly page?: number;
  /** From 1 to `MAX_BRAND_KIT_PAGE_SIZE` (10), which is also the default. */
  readonly pageSize?: number;
}

export interface BrandKitWriteOptions extends BrandKitRequestOptions {
  /** Whether anyone may read the kit. Left out, a new kit is private and an updated one keeps its setting. */
  readonly isPublic?: boolean;
}

/** One page of kit summaries: each record a summary or the errors that kept it from being one. */
export interface BrandKitPage {
  readonly results: readonly BrandKitSummaryResult[];
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly total: number;
}

export interface BrandKitStore {
  /** Summaries of the signed-in user's kits (no logo or mark), one page at a time, oldest first. */
  readonly list: (options?: BrandKitListOptions) => Promise<BrandKitPage>;
  /** One of the signed-in user's kits by its document id. */
  readonly get: (
    documentId: string,
    options?: BrandKitRequestOptions,
  ) => Promise<BrandKitRecordResult>;
  /**
   * Stores a new kit; the CMS makes the signed-in user its owner. Like `update`, never takes a
   * list's summary (or a kit spread from one), which would store a copy without logo and mark.
   */
  readonly create: (
    kit: BrandKit & { readonly logos?: never },
    options?: BrandKitWriteOptions,
  ) => Promise<BrandKitRecordResult>;
  /**
   * Replaces a kit with `kit`, every field of it. Rejects as `not-applied`, naming the fields, when
   * the CMS answers a field otherwise than it was sent. Takes a kit `get` answered, never a list's
   * summary (or a kit spread from one), which would clear the logo and mark: its `logos` marker
   * fails to compile here and is refused as `validation` before anything is sent.
   */
  readonly update: (
    documentId: string,
    kit: BrandKit & { readonly logos?: never },
    options?: BrandKitWriteOptions,
  ) => Promise<BrandKitRecordResult>;
  readonly remove: (documentId: string, options?: BrandKitRequestOptions) => Promise<void>;
  /** Summaries of every kit whose owner made it public, without credentials. */
  readonly listPublic: (options?: BrandKitListOptions) => Promise<BrandKitPage>;
  /** One public kit by its document id, without credentials. */
  readonly getPublic: (
    documentId: string,
    options?: BrandKitRequestOptions,
  ) => Promise<BrandKitRecordResult>;
}

const KITS_PATH = "/api/brand-kits";
export const MAX_BRAND_KIT_PAGE_SIZE = 10;
/**
 * The largest answer for one kit: two logos at the sanitiser's limit (512 KiB of UTF-8 each),
 * which JSON may write up to three times longer (`\/`, `\"` and `é` escapes), and the rest.
 */
export const MAX_RECORD_BYTES = 4 * 1024 * 1024;
/**
 * The largest summary in a list: a name and tagline at their CMS limits written entirely as
 * `\uXXXX` escapes, the colours, choices, ids and timestamps, with room to spare.
 */
export const MAX_SUMMARY_BYTES = 8 * 1024;
const MAX_ENVELOPE_BYTES = 4 * 1024;
const MAX_FAILURE_BYTES = 64 * 1024;
const WRITABLE_FIELDS: readonly string[] = [...CMS_FIELDS, "isPublic"];

const validation = (fields?: readonly string[]): BrandKitStoreError =>
  new BrandKitStoreError("validation", fields === undefined ? {} : { fields });
const malformed = (): BrandKitStoreError => new BrandKitStoreError("malformed-response");

function isPlainObject(value: unknown): value is object {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/** An own data property of parsed JSON; undefined for anything else. */
function own(value: unknown, key: string): unknown {
  return isPlainObject(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/** A list's summary, or a kit spread from one: it carries the summary's `logos` marker. */
const isSummary = (kit: unknown): boolean => isPlainObject(kit) && Object.hasOwn(kit, "logos");

const isAbortSignal = (signal: unknown): signal is AbortSignal =>
  typeof signal === "object" &&
  signal !== null &&
  typeof (signal as Partial<AbortSignal>).aborted === "boolean" &&
  typeof (signal as Partial<AbortSignal>).addEventListener === "function";

function readSignal(options: BrandKitRequestOptions | undefined): AbortSignal | undefined {
  const signal: unknown = options?.signal;
  if (signal === undefined) return undefined;
  if (!isAbortSignal(signal)) throw validation();
  return signal;
}

function documentPath(documentId: unknown): string {
  if (typeof documentId !== "string" || !DOCUMENT_ID.test(documentId)) throw validation();
  return `${KITS_PATH}/${documentId}`;
}

function readPageOptions(options: BrandKitListOptions | undefined): {
  page: number;
  pageSize: number;
} {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? MAX_BRAND_KIT_PAGE_SIZE;
  if (!Number.isSafeInteger(page) || page < 1) throw validation();
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_BRAND_KIT_PAGE_SIZE) {
    throw validation();
  }
  return { page, pageSize };
}

/** The kit in the CMS shape, checked again, since the type alone cannot stop a JavaScript caller. */
function writableData(
  kit: unknown,
  options: BrandKitWriteOptions | undefined,
): Record<string, unknown> {
  const isPublic: unknown = options?.isPublic;
  if (isPublic !== undefined && typeof isPublic !== "boolean") throw validation(["isPublic"]);
  if (!isPlainObject(kit)) throw validation();
  let parsed: ReturnType<typeof parseCmsBrandKit>;
  try {
    parsed = parseCmsBrandKit(brandKitToCms(kit as BrandKit));
  } catch {
    throw validation();
  }
  if (!parsed.ok) {
    const fields = [
      ...new Set(parsed.errors.map((error) => error.path).filter((path) => path !== "")),
    ];
    throw validation(fields);
  }
  return { ...brandKitToCms(parsed.kit), ...(isPublic !== undefined && { isPublic }) };
}

/**
 * The fields a write sent that the CMS answers otherwise: strapi-php keeps the old value of a field
 * sent as null (hynding/camis#122), so an answer is never taken as the kit that was asked for.
 */
function unappliedFields(sent: Record<string, unknown>, record: StoredBrandKit): string[] {
  const answered: Record<string, unknown> = {
    ...brandKitToCms(record.kit),
    isPublic: record.isPublic,
  };
  return Object.keys(sent).filter((field) => sent[field] !== answered[field]);
}

/**
 * The CMS fields a validation error names: the first segment of each `details.errors[].path`,
 * and only if it is one of the kit's own fields. The rest of a path is the server's to choose,
 * so it is never passed on, and the list holds each known field at most once.
 */
function refusedFields(body: unknown): string[] {
  const errors = own(own(own(body, "error"), "details"), "errors");
  if (!Array.isArray(errors)) return [];
  const fields = new Set<string>();
  for (const entry of errors.slice(0, 100)) {
    const path = own(entry, "path");
    const field: unknown = Array.isArray(path) ? path[0] : undefined;
    if (typeof field === "string" && WRITABLE_FIELDS.includes(field)) fields.add(field);
  }
  return [...fields];
}

async function failureOf(
  response: Response,
  signal: AbortSignal | undefined,
): Promise<BrandKitStoreError> {
  const { status } = response;
  if (status === 400) {
    const body = await readFailureBody(response, MAX_FAILURE_BYTES, signal);
    if (own(own(body, "error"), "name") === "ValidationError") {
      const fields = refusedFields(body);
      return validation(fields.length === 0 ? undefined : fields);
    }
    return new BrandKitStoreError("unexpected-status", { status });
  }
  discardBody(response);
  if (status === 401) return new BrandKitStoreError("unauthorized");
  if (status === 403) return new BrandKitStoreError("forbidden");
  if (status === 404) return new BrandKitStoreError("not-found");
  if (status === 429) {
    return new BrandKitStoreError("rate-limited", {
      retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After"), Date.now()),
    });
  }
  return new BrandKitStoreError("unexpected-status", { status });
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

/**
 * What a rejected fetch means. A TypeError is the platform's network failure, an AbortError or
 * TimeoutError an aborted request, and the identity SDK's `authorizedFetch` rejects with code
 * `network` or `unauthorized` (no one signed in). Anything else is the fetch refusing the request
 * itself (`authorizedFetch` refuses a URL outside its own base URL with code `validation`). Its
 * text is never passed on.
 */
function rejectionCode(error: unknown): BrandKitStoreErrorCode {
  const code = codeOf(error);
  if (code === "unauthorized") return "unauthorized";
  if (code === "network" || error instanceof TypeError) return "network";
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "network";
  }
  return "request-refused";
}

/**
 * A page's numbers, held to the request and to each other: the page and size asked for, the page
 * count that follows from the total, and no more rows than the total leaves for this page.
 */
function readPagination(
  meta: unknown,
  asked: { readonly page: number; readonly pageSize: number },
  rows: number,
): { page: number; pageSize: number; pageCount: number; total: number } {
  if (!isPlainObject(meta) || !hasOnlyKeys(meta, ["pagination"])) throw malformed();
  const pagination = own(meta, "pagination");
  const count = (key: string): number => {
    const value = own(pagination, key);
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw malformed();
    return value;
  };
  const page = count("page");
  const pageSize = count("pageSize");
  const pageCount = count("pageCount");
  const total = count("total");
  if (page !== asked.page || pageSize !== asked.pageSize) throw malformed();
  if (pageCount !== Math.ceil(total / pageSize)) throw malformed();
  if (rows > Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize))) throw malformed();
  return { page, pageSize, pageCount, total };
}

function readPage(
  body: unknown,
  asked: { readonly page: number; readonly pageSize: number },
  readRecord: (row: unknown) => BrandKitSummaryResult,
): BrandKitPage {
  if (!isPlainObject(body) || !hasOnlyKeys(body, ["data", "meta"])) throw malformed();
  const data = own(body, "data");
  if (!Array.isArray(data)) throw malformed();
  const numbers = readPagination(own(body, "meta"), asked, data.length);
  return Object.freeze({
    results: Object.freeze(
      data.map((row: unknown, index): BrandKitSummaryResult => {
        const result = readRecord(row);
        return result.ok ? result : { ...result, index };
      }),
    ),
    ...numbers,
  });
}

function readSingle(
  body: unknown,
  readRecord: (row: unknown) => BrandKitRecordResult,
): BrandKitRecordResult {
  if (!isPlainObject(body) || !hasOnlyKeys(body, ["data", "meta"])) throw malformed();
  const data = own(body, "data");
  if (!isPlainObject(data)) throw malformed();
  return readRecord(data);
}

/**
 * A record answered for one document id must be that kit: one with another id (or a refused one
 * naming another) is not an answer to the request, and is never passed on, nor its id named.
 */
function forDocument<Result extends BrandKitRecordResult>(
  documentId: string,
  read: (row: unknown) => Result,
): (row: unknown) => Result {
  return (row) => {
    const result = read(row);
    const answered = result.ok ? result.record.documentId : result.documentId;
    if (answered !== undefined && answered !== documentId) throw malformed();
    return result;
  };
}

/** A public read must answer public kits only; anything else is refused like a bad field. */
function publicOnly<Result extends BrandKitRecordResult | BrandKitSummaryResult>(
  read: (row: unknown) => Result,
): (row: unknown) => Result | BrandKitRecordFailure {
  return (row) => {
    const result = read(row);
    if (!result.ok || result.record.isPublic) return result;
    return {
      ok: false,
      documentId: result.record.documentId,
      errors: [
        {
          path: "isPublic",
          code: "not-allowed",
          message: "isPublic: must be true for a public kit",
        },
      ],
    };
  };
}

interface Call {
  readonly fetch: BrandKitFetch;
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly path: string;
  readonly query?: URLSearchParams;
  readonly data?: Record<string, unknown>;
  readonly signal: AbortSignal | undefined;
}

/**
 * Brand kits stored in the CMS (`cms/camis.json`, BrandKit). Everything read back is untrusted:
 * each answer is bounded, its envelope checked, and each record mapped to the kit's input and
 * passed through `parseBrandKit`, so a record that fails comes back as its errors, never as a
 * kit, and one bad record does not fail a list. Writes send the kit's fields only, never an owner.
 * Keeps no state between calls and caches nothing.
 */
export function createBrandKitStore(options: BrandKitStoreOptions): BrandKitStore {
  const base = parseStoreBaseUrl(options.baseUrl);
  if (typeof options.fetch !== "function") throw new TypeError("fetch must be a function");
  const publicFetch: unknown =
    options.publicFetch ??
    (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);
  if (typeof publicFetch !== "function") throw new TypeError("publicFetch must be a function");
  const signedIn = options.fetch;
  const anonymous = publicFetch as BrandKitFetch;

  const send = async (call: Call): Promise<Response> => {
    if (isAborted(call.signal)) throw new BrandKitStoreError("network");
    const query = call.query === undefined ? "" : `?${call.query.toString()}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (call.data !== undefined) headers["Content-Type"] = "application/json";
    const init: RequestInit = {
      method: call.method,
      headers,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      ...(call.data !== undefined && { body: JSON.stringify({ data: call.data }) }),
      ...(call.signal !== undefined && { signal: call.signal }),
    };
    let response: Response;
    try {
      response = await call.fetch(`${storeEndpoint(base, call.path)}${query}`, init);
    } catch (error) {
      // Fetch rejects with the signal's reason, which may be anything the caller aborted with.
      if (isAborted(call.signal)) throw new BrandKitStoreError("network");
      throw new BrandKitStoreError(rejectionCode(error));
    }
    if (response.status < 200 || response.status > 299)
      throw await failureOf(response, call.signal);
    return response;
  };

  const listWith = async (
    fetch: BrandKitFetch,
    listOptions: BrandKitListOptions | undefined,
    publicKits: boolean,
  ): Promise<BrandKitPage> => {
    const { page, pageSize } = readPageOptions(listOptions);
    const signal = readSignal(listOptions);
    const query = new URLSearchParams();
    query.append("sort", "id:asc");
    SUMMARY_FIELDS.forEach((field, index) => {
      query.append(`fields[${String(index)}]`, field);
    });
    query.append("pagination[page]", String(page));
    query.append("pagination[pageSize]", String(pageSize));
    if (publicKits) query.append("filters[isPublic][$eq]", "true");
    const response = await send({ fetch, method: "GET", path: KITS_PATH, query, signal });
    const body = await readJsonAnswer(
      response,
      pageSize * MAX_SUMMARY_BYTES + MAX_ENVELOPE_BYTES,
      signal,
    );
    return readPage(
      body,
      { page, pageSize },
      publicKits ? publicOnly(readCmsBrandKitSummary) : readCmsBrandKitSummary,
    );
  };

  const getWith = async (
    fetch: BrandKitFetch,
    documentId: string,
    requestOptions: BrandKitRequestOptions | undefined,
    publicKits: boolean,
  ): Promise<BrandKitRecordResult> => {
    const path = documentPath(documentId);
    const signal = readSignal(requestOptions);
    const response = await send({ fetch, method: "GET", path, signal });
    const body = await readJsonAnswer(response, MAX_RECORD_BYTES, signal);
    return readSingle(
      body,
      forDocument(documentId, publicKits ? publicOnly(readCmsBrandKit) : readCmsBrandKit),
    );
  };

  /** Creates a kit, or with `documentId` replaces that one. */
  const write = async (
    documentId: string | undefined,
    kit: BrandKit,
    writeOptions: BrandKitWriteOptions | undefined,
  ): Promise<BrandKitRecordResult> => {
    const path = documentId === undefined ? KITS_PATH : documentPath(documentId);
    const method = documentId === undefined ? "POST" : "PUT";
    if (isSummary(kit)) throw validation(["logo", "mark"]);
    const signal = readSignal(writeOptions);
    const data = writableData(kit, writeOptions);
    const response = await send({ fetch: signedIn, method, path, data, signal });
    const result = readSingle(
      await readJsonAnswer(response, MAX_RECORD_BYTES, signal),
      documentId === undefined ? readCmsBrandKit : forDocument(documentId, readCmsBrandKit),
    );
    if (!result.ok) return result;
    const unapplied = unappliedFields(data, result.record);
    if (unapplied.length > 0) {
      const { documentId } = result.record;
      throw new BrandKitStoreError("not-applied", { fields: unapplied, documentId });
    }
    return result;
  };

  return Object.freeze({
    list: (listOptions?: BrandKitListOptions) => listWith(signedIn, listOptions, false),
    get: (documentId: string, requestOptions?: BrandKitRequestOptions) =>
      getWith(signedIn, documentId, requestOptions, false),
    create: (kit: BrandKit, writeOptions?: BrandKitWriteOptions) =>
      write(undefined, kit, writeOptions),
    update: (documentId: string, kit: BrandKit, writeOptions?: BrandKitWriteOptions) =>
      write(documentId, kit, writeOptions),
    remove: async (documentId: string, requestOptions?: BrandKitRequestOptions) => {
      const path = documentPath(documentId);
      const signal = readSignal(requestOptions);
      discardBody(await send({ fetch: signedIn, method: "DELETE", path, signal }));
    },
    listPublic: (listOptions?: BrandKitListOptions) => listWith(anonymous, listOptions, true),
    getPublic: (documentId: string, requestOptions?: BrandKitRequestOptions) =>
      getWith(anonymous, documentId, requestOptions, true),
  });
}
