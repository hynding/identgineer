import type {
  CmsEventPropertyValue,
  CmsStatMetric,
  CmsStatRange,
  CmsStatSummary,
  CmsTrackedEvent,
  CmsTrackedProperty,
} from "./cms-dashboard-types.ts";
import { EVENT_NAME_PATTERN, MAX_PATH_LENGTH, PROPERTY_KEY_PATTERN } from "./wire-format.ts";

// Reads what the CMS answered (cms/camis.json: Property, Event, and the PropertySummary endpoint).
// Every reader returns undefined for anything that is not exactly what the model allows, so one
// malformed record makes the whole answer `invalid-response` rather than half an answer.

/** A document id on both CMS targets (Strapi's are 24 lower-case letters and digits). */
export const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

// Property.domain's pattern in cms/camis.json.
const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MAX_DOMAIN_LENGTH = 253;
/** Property.name holds 80 characters; Strapi counts UTF-16 units, strapi-php code points. */
const MAX_NAME_LENGTH = 160;
/** The wire format's 32 properties a batch event may carry, with room to spare. */
const MAX_EVENT_PROPERTIES = 64;
/** The wire format's 1024 code points of a string property, in UTF-16 units. */
const MAX_PROPERTY_TEXT = 2048;
// A time as both CMS targets write one: UTC with milliseconds.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const SERIES_LENGTH: Readonly<Record<CmsStatRange, number>> = { "24h": 24, "7d": 7, "30d": 30 };

export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** An own data property of parsed JSON; undefined for anything else. */
export function own(value: unknown, key: string): unknown {
  return isPlainObject(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}

export const hasOnlyKeys = (value: object, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const documentIdOf = (row: unknown): string | undefined => {
  const id = own(row, "documentId");
  return typeof id === "string" && DOCUMENT_ID.test(id) ? id : undefined;
};

export function readProperty(row: unknown): CmsTrackedProperty | undefined {
  const id = documentIdOf(row);
  const name = own(row, "name");
  const domain = own(row, "domain");
  if (id === undefined || typeof name !== "string" || name.trim() === "") return undefined;
  if (name.length > MAX_NAME_LENGTH || typeof domain !== "string") return undefined;
  if (domain.length > MAX_DOMAIN_LENGTH || !DOMAIN.test(domain)) return undefined;
  return { id, name, origin: `https://${domain}` };
}

function propertyValue(value: unknown): CmsEventPropertyValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return typeof value === "string" && value.length <= MAX_PROPERTY_TEXT ? value : undefined;
}

function eventProperties(value: unknown): Record<string, CmsEventPropertyValue> | undefined {
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length > MAX_EVENT_PROPERTIES) return undefined;
  const entries: [string, CmsEventPropertyValue][] = [];
  for (const key of keys) {
    const kept = propertyValue(value[key]);
    if (kept === undefined || !PROPERTY_KEY_PATTERN.test(key)) return undefined;
    entries.push([key, kept]);
  }
  // fromEntries defines each key as data, so a key named __proto__ never reaches the prototype.
  return Object.fromEntries(entries);
}

export function readEvent(row: unknown): CmsTrackedEvent | undefined {
  const id = documentIdOf(row);
  const name = own(row, "name");
  const occurredAt = own(row, "occurredAt");
  if (id === undefined || typeof name !== "string" || !EVENT_NAME_PATTERN.test(name)) {
    return undefined;
  }
  if (typeof occurredAt !== "string" || !ISO_UTC.test(occurredAt)) return undefined;
  const time = Date.parse(occurredAt);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== occurredAt) return undefined;
  const path = own(row, "path");
  if (path !== null && path !== undefined) {
    if (typeof path !== "string" || !path.startsWith("/") || path.length > MAX_PATH_LENGTH * 2) {
      return undefined;
    }
  }
  const stored = own(row, "properties");
  const properties = stored === null || stored === undefined ? undefined : eventProperties(stored);
  if (stored !== null && stored !== undefined && properties === undefined) return undefined;
  return {
    id,
    name,
    occurredAt,
    ...(typeof path === "string" && { path }),
    ...(properties !== undefined && { properties }),
  };
}

export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly total: number;
}

/**
 * A list's page numbers, held to the request and to each other: the page and size asked for, the
 * page count that follows from the total, and no more rows than the total leaves for the page.
 */
export function readPagination(
  meta: unknown,
  asked: { readonly page: number; readonly pageSize: number },
  rows: number,
): Pagination | undefined {
  if (!isPlainObject(meta) || !hasOnlyKeys(meta, ["pagination"])) return undefined;
  const pagination = own(meta, "pagination");
  const page = own(pagination, "page");
  const pageSize = own(pagination, "pageSize");
  const pageCount = own(pagination, "pageCount");
  const total = own(pagination, "total");
  if (!isCount(page) || !isCount(pageSize) || !isCount(pageCount) || !isCount(total)) {
    return undefined;
  }
  if (page !== asked.page || pageSize !== asked.pageSize) return undefined;
  if (pageCount !== Math.ceil(total / pageSize)) return undefined;
  if (rows > Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize))) return undefined;
  return { page, pageSize, pageCount, total };
}

/**
 * A figure of the summary. A count of events (`summed`) is the sum of its buckets, as both CMS
 * targets compute it; distinct visitors are not, as one visitor in two buckets counts once.
 */
function readMetric(value: unknown, length: number, summed: boolean): CmsStatMetric | undefined {
  if (!isPlainObject(value)) return undefined;
  const figure = own(value, "value");
  const previous = own(value, "previous");
  const series = own(value, "series");
  if (!isCount(figure) || !isCount(previous) || !Array.isArray(series)) return undefined;
  if (series.length !== length || !series.every(isCount)) return undefined;
  if (summed && series.reduce((sum, count) => sum + count, 0) !== figure) return undefined;
  return { value: figure, previous, series: [...series] };
}

/** The summary asked for: of this property and range, with three whole figures. */
export function readSummary(
  data: unknown,
  propertyId: string,
  range: CmsStatRange,
): CmsStatSummary | undefined {
  if (own(data, "propertyId") !== propertyId || own(data, "range") !== range) return undefined;
  const length = SERIES_LENGTH[range];
  const visitors = readMetric(own(data, "visitors"), length, false);
  const pageViews = readMetric(own(data, "pageViews"), length, true);
  const events = readMetric(own(data, "events"), length, true);
  if (!visitors || !pageViews || !events) return undefined;
  return { propertyId, range, visitors, pageViews, events };
}
