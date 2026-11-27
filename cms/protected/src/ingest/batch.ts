// The tracking SDK's wire format (packages/tracking/src/wire-format.ts and parse-tracking-batch.ts),
// restated for the Strapi project, which is built on its own and cannot import the SDK. The shared
// vectors (packages/tracking/src/testing/batch-vectors.json) hold this copy, the SDK's and the
// strapi-php handler's to the same answers (cms/tests/ingest-batch.test.ts). Written for Strapi's
// compiler settings (ES2020 library), so no Object.hasOwn.

export const WIRE_VERSION = 1;
export const MAX_EVENTS_PER_BATCH = 500;
export const MAX_TRACKING_BATCH_BYTES = 65_536;
const MAX_PROPERTIES_PER_EVENT = 32;
const MAX_WIRE_STRING_LENGTH = 1024;
const MAX_PATH_LENGTH = 2048;
const MAX_TIMESTAMP = 8_640_000_000_000_000;

export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const PROPERTY_KEY_PATTERN = EVENT_NAME_PATTERN;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const WRITE_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const PATH_PATTERN = /^\/[!"$-~]*$/;
const REFERRER_PATTERN = /^https?:\/\/[A-Za-z0-9.:[\]-]{1,253}$/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export type PropertyValue = string | number | boolean;

export interface WireEvent {
  readonly id: string;
  readonly name: string;
  readonly at: number;
  readonly session?: string;
  readonly user?: string;
  readonly path?: string;
  readonly referrer?: string;
  readonly properties?: Readonly<Record<string, PropertyValue>>;
}

export interface WireBatch {
  readonly v: typeof WIRE_VERSION;
  readonly sentAt: number;
  readonly transport: "fetch" | "beacon";
  readonly writeKey?: string;
  readonly events: readonly WireEvent[];
}

export type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

class Rejection extends Error {}

const reject = (where: string, rule: string): never => {
  throw new Rejection(`${where}: ${rule}`);
};

const owns = (source: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(source, key);

const codePointLength = (text: string): number => Array.from(text).length;

const utf8Length = (text: string): number => {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
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
  !LONE_SURROGATE.test(value)
    ? value
    : reject(where, rule);

const propertyValue = (value: unknown, where: string): PropertyValue => {
  if (typeof value === "string") {
    return codePointLength(value) <= MAX_WIRE_STRING_LENGTH && !LONE_SURROGATE.test(value)
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

const event = (value: unknown, where: string): WireEvent => {
  const source = record(value, where);
  checkKeys(source, EVENT_KEYS, where);
  const optional = <T>(key: string, parse: (item: unknown, at: string) => T): T | undefined =>
    source[key] === undefined && !owns(source, key)
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

const transportOf = (value: unknown): "fetch" | "beacon" =>
  value === "fetch" || value === "beacon"
    ? value
    : reject("batch.transport", "must be fetch or beacon");

const batch = (input: unknown): WireBatch => {
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
    if (!owns(items, index)) reject(`events[${String(index)}]`, "is missing");
  }
  const events = items.map((item, index) => event(item, `events[${String(index)}]`));
  const seen = new Set<string>();
  events.forEach((item, index) => {
    if (seen.has(item.id)) reject(`events[${String(index)}].id`, "is a duplicate in the batch");
    seen.add(item.id);
  });
  const writeKey = owns(source, "writeKey")
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

/** A decoded request body, typed, or which field broke which rule. Strict, as the SDK's is. */
export const parseBatch = (input: unknown): ParseResult<WireBatch> => {
  try {
    return { ok: true, value: batch(input) };
  } catch (error) {
    if (error instanceof Rejection) return { ok: false, error: error.message };
    throw error;
  }
};

/** A request body as text: refused above MAX_TRACKING_BATCH_BYTES before it is parsed. */
export const parseBatchText = (body: string): ParseResult<WireBatch> => {
  const bytes = utf8Length(body);
  if (bytes > MAX_TRACKING_BATCH_BYTES) {
    return {
      ok: false,
      error: `body: ${String(bytes)} bytes exceed the cap of ${String(MAX_TRACKING_BATCH_BYTES)} bytes`,
    };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    return { ok: false, error: "body: is not JSON" };
  }
  return parseBatch(decoded);
};

export { utf8Length };
