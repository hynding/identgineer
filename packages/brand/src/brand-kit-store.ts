import type { BrandKit } from "./brand-kit.ts";
import { BrandKitStoreError } from "./brand-kit-store-error.ts";
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
import { discardBody, readFailureBody, readJsonAnswer } from "./read-cms-answer.ts";
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
  /** From 1 to `MAX_PAGE_SIZE`, which is also the default. */
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
  /** Stores a new kit; the CMS makes the signed-in user its owner. */
  readonly create: (kit: BrandKit, options?: BrandKitWriteOptions) => Promise<BrandKitRecordResult>;
  /**
   * Replaces a kit with `kit`, every field of it. Rejects as `not-applied`, naming the fields, when
   * the CMS answers a field otherwise than it was sent.
   */
  readonly update: (
    documentId: string,
    kit: BrandKit,
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
export const MAX_PAGE_SIZE = 10;
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
const MAX_REPORTED_FIELDS = 20;
const FIELD_SEGMENT = /^[A-Za-z0-9_]{1,64}$/;
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
  const pageSize = options?.pageSize ?? MAX_PAGE_SIZE;
  if (!Number.isSafeInteger(page) || page < 1) throw validation();
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
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

/** The CMS fields a validation error names (`details.errors[].path`), and only the kit's own. */
function refusedFields(body: unknown): string[] {
  const errors = own(own(own(body, "error"), "details"), "errors");
  if (!Array.isArray(errors)) return [];
  const fields = new Set<string>();
  for (const entry of errors.slice(0, 100)) {
    const path = own(entry, "path");
    if (!Array.isArray(path) || path.length === 0) continue;
    const segments = path.map((segment: unknown) =>
      typeof segment === "number" ? String(segment) : segment,
    );
    if (!segments.every((segment) => typeof segment === "string" && FIELD_SEGMENT.test(segment))) {
      continue;
    }
    if (!WRITABLE_FIELDS.includes(String(segments[0]))) continue;
    fields.add(segments.join("."));
    if (fields.size === MAX_REPORTED_FIELDS) break;
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

/** The identity SDK's `authorizedFetch` rejects with code `unauthorized` when no one is signed in. */
function isSignedOut(error: unknown): boolean {
  try {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "unauthorized"
    );
  } catch {
    return false;
  }
}

function readPage(
  body: unknown,
  pageSize: number,
  readRecord: (row: unknown) => BrandKitSummaryResult,
): BrandKitPage {
  if (!isPlainObject(body) || !hasOnlyKeys(body, ["data", "meta"])) throw malformed();
  const data = own(body, "data");
  const meta = own(body, "meta");
  if (!Array.isArray(data) || data.length > pageSize) throw malformed();
  if (!isPlainObject(meta) || !hasOnlyKeys(meta, ["pagination"])) throw malformed();
  const pagination = own(meta, "pagination");
  const count = (key: string, minimum: number): number => {
    const value = own(pagination, key);
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
      throw malformed();
    }
    return value;
  };
  return Object.freeze({
    results: Object.freeze(
      data.map((row: unknown, index): BrandKitSummaryResult => {
        const result = readRecord(row);
        return result.ok ? result : { ...result, index };
      }),
    ),
    page: count("page", 1),
    pageSize: count("pageSize", 1),
    pageCount: count("pageCount", 0),
    total: count("total", 0),
  });
}

function readSingle(
  body: unknown,
  readRecord: (row: unknown) => BrandKitRecordResult,
): BrandKitRecordResult {
  if (!isPlainObject(body) || !hasOnlyKeys(body, ["data", "meta"])) throw malformed();
  const data = own(body, "data");
  if (data === undefined) throw malformed();
  return readRecord(data);
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
    if (call.signal?.aborted === true) throw new BrandKitStoreError("network");
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
      throw new BrandKitStoreError(isSignedOut(error) ? "unauthorized" : "network");
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
      pageSize,
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
    return readSingle(body, publicKits ? publicOnly(readCmsBrandKit) : readCmsBrandKit);
  };

  const write = async (
    method: "POST" | "PUT",
    path: string,
    kit: BrandKit,
    writeOptions: BrandKitWriteOptions | undefined,
  ): Promise<BrandKitRecordResult> => {
    const signal = readSignal(writeOptions);
    const data = writableData(kit, writeOptions);
    const response = await send({ fetch: signedIn, method, path, data, signal });
    const result = readSingle(
      await readJsonAnswer(response, MAX_RECORD_BYTES, signal),
      readCmsBrandKit,
    );
    if (!result.ok) return result;
    const unapplied = unappliedFields(data, result.record);
    if (unapplied.length > 0) throw new BrandKitStoreError("not-applied", { fields: unapplied });
    return result;
  };

  return Object.freeze({
    list: (listOptions?: BrandKitListOptions) => listWith(signedIn, listOptions, false),
    get: (documentId: string, requestOptions?: BrandKitRequestOptions) =>
      getWith(signedIn, documentId, requestOptions, false),
    create: (kit: BrandKit, writeOptions?: BrandKitWriteOptions) =>
      write("POST", KITS_PATH, kit, writeOptions),
    update: async (documentId: string, kit: BrandKit, writeOptions?: BrandKitWriteOptions) =>
      write("PUT", documentPath(documentId), kit, writeOptions),
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
