import {
  STAT_RANGES,
  type EventPage,
  type EventPropertyValue,
  type StatMetric,
  type StatSummary,
  type TrackedEvent,
  type TrackedProperty,
} from "./dashboard-types";

/**
 * How much of what crosses the seam is kept. A response that is larger than anyone could read is
 * cut here, before it reaches the page's memory or a component's loop.
 */
export const DASHBOARD_LIMITS = {
  properties: 200,
  events: 1_000,
  /** Properties kept on one event. */
  eventProperties: 50,
  series: 400,
  /** The most events asked for or drawn in one page. */
  pageSize: 100,
  /** The most events a total may claim: more would make a pager of pages no one will reach. */
  total: 10_000_000,
  idLength: 200,
  textLength: 10_000,
} as const;

type UnknownRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

/** An own property only, so a prototype's `id` is not mistaken for the record's. */
function field(record: UnknownRecord, name: string): unknown {
  return Object.hasOwn(record, name) ? record[name] : undefined;
}

function identifier(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.trim() !== "" &&
    value.length <= DASHBOARD_LIMITS.idLength
    ? value
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && value.length <= DASHBOARD_LIMITS.textLength
    ? value
    : undefined;
}

function httpOrigin(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function parseTrackedProperty(value: unknown): TrackedProperty | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = identifier(field(record, "id"));
  const name = text(field(record, "name"));
  if (id === undefined || name === undefined) return undefined;
  const origin = httpOrigin(field(record, "origin"));
  return origin === undefined ? { id, name } : { id, name, origin };
}

/**
 * The records that parse, once each, in order, read only until `limit` are kept: a response with a
 * million entries costs the limit, not the million.
 */
function collect<T extends { readonly id: string }>(
  list: readonly unknown[],
  parse: (value: unknown) => T | undefined,
  limit: number,
): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const entry of list) {
    const record = parse(entry);
    if (record === undefined || seen.has(record.id)) continue;
    seen.add(record.id);
    kept.push(record);
    if (kept.length === limit) break;
  }
  return kept;
}

/** The properties that are well formed, once each, in the order they came. */
export function parseTrackedProperties(value: unknown): TrackedProperty[] {
  return Array.isArray(value)
    ? collect(value, parseTrackedProperty, DASHBOARD_LIMITS.properties)
    : [];
}

// A time with its zone, so that it names one instant; a bare date or a time without a zone would
// be read in the browser's zone and mean something different to each reader.
const ISO_WITH_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

/** Every part is in its range, so a date the calendar lacks is refused and not rolled over. */
function isCalendarTime(parts: RegExpExecArray): boolean {
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = parts
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part)));
  const daysInMonth = new Date(Date.UTC(year ?? 0, month ?? 0, 0)).getUTCDate();
  return (
    (month ?? 0) >= 1 &&
    (month ?? 0) <= 12 &&
    (day ?? 0) >= 1 &&
    (day ?? 0) <= daysInMonth &&
    (hour ?? 0) <= 23 &&
    (minute ?? 0) <= 59 &&
    (second ?? 0) <= 59 &&
    (offsetHour ?? 0) <= 23 &&
    (offsetMinute ?? 0) <= 59
  );
}

function isoTime(value: unknown): string | undefined {
  let milliseconds: number;
  if (typeof value === "number") milliseconds = value;
  else if (typeof value === "string") {
    const parts = ISO_WITH_ZONE.exec(value);
    if (!parts || !isCalendarTime(parts)) return undefined;
    milliseconds = Date.parse(value);
  } else return undefined;
  if (!Number.isFinite(milliseconds)) return undefined;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function propertyValue(value: unknown): EventPropertyValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return typeof value === "string" && value.length <= DASHBOARD_LIMITS.textLength
    ? value
    : undefined;
}

function eventProperties(value: unknown): Record<string, EventPropertyValue> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const entries: [string, EventPropertyValue][] = [];
  // The keys of an object that is already in memory are listed; their values are read only until
  // the limit is reached.
  for (const key of Object.keys(record)) {
    const kept = propertyValue(record[key]);
    if (kept === undefined || key.length > DASHBOARD_LIMITS.idLength) continue;
    entries.push([key, kept]);
    if (entries.length === DASHBOARD_LIMITS.eventProperties) break;
  }
  // fromEntries defines each key as data, so a key named __proto__ never reaches the prototype.
  return Object.fromEntries(entries);
}

function parseTrackedEvent(value: unknown): TrackedEvent | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = identifier(field(record, "id"));
  const name = text(field(record, "name"));
  const occurredAt = isoTime(field(record, "occurredAt"));
  if (id === undefined || name === undefined || occurredAt === undefined) return undefined;
  const path = text(field(record, "path"));
  const properties = eventProperties(field(record, "properties"));
  return {
    id,
    name,
    occurredAt,
    ...(path === undefined ? {} : { path }),
    ...(properties === undefined ? {} : { properties }),
  };
}

/** The events that are well formed, once each, in the order they came. */
export function parseTrackedEvents(value: unknown): TrackedEvent[] {
  return Array.isArray(value) ? collect(value, parseTrackedEvent, DASHBOARD_LIMITS.events) : [];
}

/** A page of events and its total, or undefined for a response that has no list of events. */
export function parseEventPage(value: unknown): EventPage | undefined {
  const record = asRecord(value);
  const list = record === undefined ? undefined : field(record, "events");
  if (record === undefined || !Array.isArray(list)) return undefined;
  const events = parseTrackedEvents(list);
  const total = field(record, "total");
  const stated = typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : 0;
  return { events, total: Math.min(Math.max(stated, events.length), DASHBOARD_LIMITS.total) };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMetric(value: unknown): StatMetric | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const figure = field(record, "value");
  const series = field(record, "series");
  if (!finite(figure) || !Array.isArray(series)) return undefined;
  const previous = field(record, "previous");
  return {
    value: figure,
    ...(finite(previous) ? { previous } : {}),
    series: series.filter(finite).slice(0, DASHBOARD_LIMITS.series),
  };
}

/** A summary whose three figures are all well formed, or undefined: half a summary misleads. */
export function parseStatSummary(value: unknown): StatSummary | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const propertyId = identifier(field(record, "propertyId"));
  const range = STAT_RANGES.find((candidate) => candidate === field(record, "range"));
  const visitors = parseMetric(field(record, "visitors"));
  const pageViews = parseMetric(field(record, "pageViews"));
  const events = parseMetric(field(record, "events"));
  if (!propertyId || !range || !visitors || !pageViews || !events) return undefined;
  return { propertyId, range, visitors, pageViews, events };
}
