import { describe, expect, it } from "vitest";
import { parseTrackingBatch } from "./parse-tracking-batch.ts";
import { TRACKING_BATCH_JSON_SCHEMA } from "./tracking-batch-schema.ts";

interface Schema {
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | Schema;
  readonly propertyNames?: Schema;
  readonly items?: Schema;
  readonly oneOf?: readonly Schema[];
  readonly not?: Schema;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly maxProperties?: number;
  readonly const?: unknown;
  readonly $defs?: Readonly<Record<string, Schema>>;
}

const ROOT = TRACKING_BATCH_JSON_SCHEMA as unknown as Schema;

const typeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};

const typeMatches = (value: unknown, type: string): boolean => {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
};

const resolve = (schema: Schema): Schema => {
  if (schema.$ref === undefined) return schema;
  const name = schema.$ref.replace("#/$defs/", "");
  const target = ROOT.$defs?.[name];
  if (target === undefined) throw new Error(`unresolved ${schema.$ref}`);
  return target;
};

// A checker for the subset of JSON Schema the document uses, so the test needs no dependency.
const conforms = (value: unknown, raw: Schema): boolean => {
  const schema = resolve(raw);
  if (
    schema.oneOf !== undefined &&
    schema.oneOf.filter((option) => conforms(value, option)).length !== 1
  ) {
    return false;
  }
  if (schema.not !== undefined && conforms(value, schema.not)) return false;
  if (schema.type !== undefined) {
    const types = typeof schema.type === "string" ? [schema.type] : schema.type;
    if (!types.some((type) => typeMatches(value, type))) return false;
  }
  if ("const" in schema && schema.const !== value) return false;
  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) return false;
    // JSON Schema counts code points, and the validator counts them the same way.
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) return false;
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) return false;
    // JSON Schema strings are Unicode: a lone surrogate is not a valid one.
    if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(value)) {
      return false;
    }
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    const { items } = schema;
    if (items !== undefined && !value.every((item) => conforms(item, items))) return false;
  }
  if (typeOf(value) === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) return false;
    if (!(schema.required ?? []).every((key) => Object.hasOwn(record, key))) return false;
    const { propertyNames } = schema;
    if (propertyNames !== undefined && !keys.every((key) => conforms(key, propertyNames))) {
      return false;
    }
    for (const key of keys) {
      const known = schema.properties?.[key];
      if (known !== undefined) {
        if (!conforms(record[key], known)) return false;
      } else if (schema.additionalProperties === false) {
        return false;
      } else if (typeof schema.additionalProperties === "object") {
        if (!conforms(record[key], schema.additionalProperties)) return false;
      }
    }
  }
  return true;
};

const event = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  name: "signup_completed",
  at: 1_700_000_000_000,
  session: "BBBBBBBBBBBBBBBBBBBBBB",
  ...overrides,
});
const batch = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1,
  sentAt: 1_700_000_001_000,
  transport: "fetch",
  events: [event()],
  ...overrides,
});

const manyProperties = (count: number): Record<string, number> =>
  Object.fromEntries(Array.from({ length: count }, (_v, i) => [`p${String(i)}`, i]));

const CORPUS: readonly [string, unknown][] = [
  ["a minimal batch", batch()],
  ["a beacon with the write key", batch({ transport: "beacon", writeKey: "k".repeat(16) })],
  ["a beacon with a short write key", batch({ transport: "beacon", writeKey: "k".repeat(15) })],
  ["a beacon with a long write key", batch({ transport: "beacon", writeKey: "k".repeat(129) })],
  ["a beacon without the key", batch({ transport: "beacon" })],
  ["a fetch batch with the key", batch({ writeKey: "k".repeat(16) })],
  ["another transport", batch({ transport: "xhr" })],
  ["no transport", { v: 1, sentAt: 1, events: [event()] }],
  [
    "an event without a session",
    batch({
      events: [Object.fromEntries(Object.entries(event()).filter(([key]) => key !== "session"))],
    }),
  ],
  ["a null session", batch({ events: [event({ session: null })] })],
  ["1024 emoji", batch({ events: [event({ properties: { a: "\u{1f600}".repeat(1024) } })] })],
  ["1025 emoji", batch({ events: [event({ properties: { a: "\u{1f600}".repeat(1025) } })] })],
  ["another version", batch({ v: 2 })],
  ["a version as a string", batch({ v: "1" })],
  ["no events", batch({ events: [] })],
  ["too many events", batch({ events: Array.from({ length: 501 }, () => event()) })],
  ["500 events", batch({ events: Array.from({ length: 500 }, () => event()) })],
  ["an unknown batch key", batch({ extra: true })],
  ["a fractional sentAt", batch({ sentAt: 0.5 })],
  ["a negative at", batch({ events: [event({ at: -1 })] })],
  ["an at beyond the Date range", batch({ events: [event({ at: 8.64e15 + 1 })] })],
  ["an unknown event key", batch({ events: [event({ ip: "1.2.3.4" })] })],
  ["an upper-case name", batch({ events: [event({ name: "Signup" })] })],
  ["a 64 character name", batch({ events: [event({ name: `a${"b".repeat(63)}` })] })],
  ["a 65 character name", batch({ events: [event({ name: `a${"b".repeat(64)}` })] })],
  ["a short id", batch({ events: [event({ id: "short" })] })],
  ["a user", batch({ events: [event({ user: "user_1" })] })],
  ["an email as a user", batch({ events: [event({ user: "ada@example.com" })] })],
  ["a path with a query", batch({ events: [event({ path: "/a?utm_source=x" })] })],
  ["a path with a fragment", batch({ events: [event({ path: "/a#x" })] })],
  ["a path with a space", batch({ events: [event({ path: "/a b" })] })],
  ["a relative path", batch({ events: [event({ path: "a" })] })],
  ["a referrer origin", batch({ events: [event({ referrer: "https://example.org:8443" })] })],
  ["a referrer with a path", batch({ events: [event({ referrer: "https://example.org/a" })] })],
  ["a javascript referrer", batch({ events: [event({ referrer: "javascript:alert(1)" })] })],
  [
    "mixed properties",
    batch({ events: [event({ properties: { a: "x", b: 1.5, c: true, constructor: "y" } })] }),
  ],
  ["a null property", batch({ events: [event({ properties: { a: null } })] })],
  ["a nested property", batch({ events: [event({ properties: { a: { b: 1 } } })] })],
  ["an array property", batch({ events: [event({ properties: { a: [1] } })] })],
  ["an upper-case property key", batch({ events: [event({ properties: { A: 1 } })] })],
  ["a string of 1025 units", batch({ events: [event({ properties: { a: "x".repeat(1025) } })] })],
  ["a lone surrogate", batch({ events: [event({ properties: { a: "x\ud800" } })] })],
  ["32 properties", batch({ events: [event({ properties: manyProperties(32) })] })],
  ["33 properties", batch({ events: [event({ properties: manyProperties(33) })] })],
  ["null", null],
  ["an array", []],
];

describe("TRACKING_BATCH_JSON_SCHEMA", () => {
  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(TRACKING_BATCH_JSON_SCHEMA))).toEqual(
      TRACKING_BATCH_JSON_SCHEMA,
    );
  });

  it("names the draft and the wire version", () => {
    expect(TRACKING_BATCH_JSON_SCHEMA.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(ROOT.properties?.v?.const).toBe(1);
  });

  it.each(CORPUS)("agrees with the validator on %s", (_label, input) => {
    expect(conforms(input, ROOT)).toBe(parseTrackingBatch(input).ok);
  });
});
