import {
  EVENT_NAME_PATTERN,
  IDENTIFIER_PATTERN,
  MAX_EVENTS_PER_BATCH,
  MAX_PATH_LENGTH,
  MAX_PROPERTIES_PER_EVENT,
  MAX_TIMESTAMP,
  MAX_TRACKING_BATCH_BYTES,
  MAX_WIRE_STRING_LENGTH,
  PATH_PATTERN,
  PROPERTY_KEY_PATTERN,
  REFERRER_PATTERN,
  TOKEN_PATTERN,
  WIRE_VERSION,
  WRITE_KEY_PATTERN,
  type ParseResult,
  type PropertyValue,
  type TrackingBatch,
  type TrackingEvent,
  type TrackingTransport,
} from "./wire-format.ts";
import { codePointLength } from "./code-point-length.ts";
import { isWellFormed } from "./well-formed.ts";
import { utf8Length } from "./utf8-length.ts";

export { MAX_TRACKING_BATCH_BYTES };

class Rejection extends Error {}

const reject = (where: string, rule: string): never => {
  throw new Rejection(`${where}: ${rule}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};

const record = (value: unknown, where: string): Record<string, unknown> =>
  isRecord(value) ? value : reject(where, "must be an object");

// Own keys, so an own `__proto__` (which JSON.parse creates) is seen and refused as unknown.
const checkKeys = (
  source: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void => {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) reject(`${where}.${key}`.replace(/^\./, ""), "is not allowed");
  }
};

const timestamp = (value: unknown, where: string): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_TIMESTAMP
    ? value
    : reject(where, "must be a whole number of milliseconds since the epoch");

const text = (
  value: unknown,
  where: string,
  pattern: RegExp,
  maxLength: number,
  rule: string,
): string =>
  typeof value === "string" &&
  codePointLength(value) <= maxLength &&
  pattern.test(value) &&
  isWellFormed(value)
    ? value
    : reject(where, rule);

const propertyValue = (value: unknown, where: string): PropertyValue => {
  if (typeof value === "string") {
    return codePointLength(value) <= MAX_WIRE_STRING_LENGTH && isWellFormed(value)
      ? value
      : reject(
          where,
          `must be a well-formed string of at most ${String(MAX_WIRE_STRING_LENGTH)} code points`,
        );
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : reject(where, "must be a finite number");
  }
  return typeof value === "boolean" ? value : reject(where, "must be a string, number or boolean");
};

const properties = (value: unknown, where: string): Record<string, PropertyValue> => {
  const source = record(value, where);
  const keys = Object.keys(source);
  if (keys.length > MAX_PROPERTIES_PER_EVENT) {
    reject(where, `has more than ${String(MAX_PROPERTIES_PER_EVENT)} properties`);
  }
  // fromEntries defines own data properties, so no key can reach the prototype.
  return Object.fromEntries(
    keys.map((key) => {
      text(key, `${where}.${key}`, PROPERTY_KEY_PATTERN, 64, "is not a valid property key");
      return [key, propertyValue(source[key], `${where}.${key}`)];
    }),
  );
};

const EVENT_KEYS = ["id", "name", "at", "session", "user", "path", "referrer", "properties"];

const event = (value: unknown, where: string): TrackingEvent => {
  const source = record(value, where);
  checkKeys(source, EVENT_KEYS, where);
  const optional = <T>(key: string, parse: (item: unknown, at: string) => T): T | undefined =>
    source[key] === undefined && !Object.hasOwn(source, key)
      ? undefined
      : parse(source[key], `${where}.${key}`);
  const user = optional("user", (item, at) =>
    text(item, at, IDENTIFIER_PATTERN, 64, "must match [A-Za-z0-9_-]{1,64}"),
  );
  const path = optional("path", (item, at) =>
    text(
      item,
      at,
      PATH_PATTERN,
      MAX_PATH_LENGTH,
      "must be an origin-relative path with no fragment",
    ),
  );
  const referrer = optional("referrer", (item, at) =>
    text(item, at, REFERRER_PATTERN, 260, "must be an origin and nothing else"),
  );
  const session = optional("session", (item, at) =>
    text(item, at, TOKEN_PATTERN, 64, "must be 16 to 64 base64url characters"),
  );
  const props = optional("properties", properties);
  return {
    id: text(source.id, `${where}.id`, TOKEN_PATTERN, 64, "must be 16 to 64 base64url characters"),
    name: text(
      source.name,
      `${where}.name`,
      EVENT_NAME_PATTERN,
      64,
      "must match [a-z][a-z0-9_]{0,63}",
    ),
    at: timestamp(source.at, `${where}.at`),
    ...(session === undefined ? {} : { session }),
    ...(user === undefined ? {} : { user }),
    ...(path === undefined ? {} : { path }),
    ...(referrer === undefined ? {} : { referrer }),
    ...(props === undefined ? {} : { properties: props }),
  };
};

const attempt = <T>(parse: () => T): ParseResult<T> => {
  try {
    return { ok: true, value: parse() };
  } catch (error) {
    if (error instanceof Rejection) return { ok: false, error: error.message };
    throw error;
  }
};

/** Checks one event as it appears in a batch (the offline queue stores events on their own). */
export const parseTrackingEvent = (input: unknown): ParseResult<TrackingEvent> =>
  attempt(() => event(input, "event"));

const transportOf = (value: unknown): TrackingTransport =>
  value === "fetch" || value === "beacon"
    ? value
    : reject("batch.transport", "must be fetch or beacon");

const batch = (input: unknown): TrackingBatch => {
  const source = record(input, "batch");
  checkKeys(source, ["v", "sentAt", "transport", "writeKey", "events"], "batch");
  if (source.v !== WIRE_VERSION) reject("batch.v", `must be ${String(WIRE_VERSION)}`);
  const sentAt = timestamp(source.sentAt, "batch.sentAt");
  const transport = transportOf(source.transport);
  const list = source.events;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_EVENTS_PER_BATCH) {
    reject("batch.events", `must be a list of 1 to ${String(MAX_EVENTS_PER_BATCH)} events`);
  }
  // A sparse list has holes that map() would skip, so every index is looked at.
  const items = list as unknown[];
  for (let index = 0; index < items.length; index += 1) {
    if (!Object.hasOwn(items, index)) reject(`events[${String(index)}]`, "is missing");
  }
  const events = items.map((item, index) => event(item, `events[${String(index)}]`));
  const seen = new Set<string>();
  events.forEach((item, index) => {
    if (seen.has(item.id)) reject(`events[${String(index)}].id`, "is a duplicate in the batch");
    seen.add(item.id);
  });
  const writeKey = Object.hasOwn(source, "writeKey")
    ? text(
        source.writeKey,
        "batch.writeKey",
        WRITE_KEY_PATTERN,
        128,
        "must match [A-Za-z0-9_-]{16,128}",
      )
    : undefined;
  if ((transport === "beacon") !== (writeKey !== undefined)) {
    reject("batch.writeKey", "must be present in a beacon and absent in a fetch batch");
  }
  return {
    v: WIRE_VERSION,
    sentAt,
    transport,
    ...(writeKey === undefined ? {} : { writeKey }),
    events,
  };
};

/**
 * Checks a decoded request body and returns it typed, or says which field broke which rule. Strict:
 * an unknown key, an own `__proto__`, a non-finite number, a nested value or a lone surrogate is
 * refused, never repaired. It uses no browser API, so a server can run it.
 */
export const parseTrackingBatch = (input: unknown): ParseResult<TrackingBatch> =>
  attempt(() => batch(input));

/**
 * Reads a request body as text: refuses one above `MAX_TRACKING_BATCH_BYTES` before parsing it,
 * so a server need not hold a large JSON tree to find out it is too big. A server must still cap
 * the body as it reads it from the socket, as this only sees what was already buffered.
 */
export const parseTrackingBatchText = (text: string): ParseResult<TrackingBatch> => {
  const bytes = utf8Length(text);
  if (bytes > MAX_TRACKING_BATCH_BYTES) {
    return {
      ok: false,
      error: `body: ${String(bytes)} bytes exceed the cap of ${String(MAX_TRACKING_BATCH_BYTES)} bytes`,
    };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return { ok: false, error: "body: is not JSON" };
  }
  return parseTrackingBatch(decoded);
};
