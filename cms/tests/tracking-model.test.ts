import { describe, expect, it } from "vitest";
import {
  EVENT_NAME_PATTERN,
  MAX_PATH_LENGTH,
  MAX_TRACKING_BATCH_BYTES,
  PROPERTY_KEY_PATTERN,
} from "../../packages/tracking/src/wire-format.ts";
import { contentTypeNamed, loadIr, type Field } from "./model";

// The CMS stores what @identgineer/tracking sends. These checks fail when the model drifts from the
// SDK's wire format: a value the SDK sends that the CMS would refuse to store.

const ir = loadIr();

const fieldIn = (fields: readonly Field[], owner: string, name: string): Field => {
  const field = fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`${owner} has no "${name}" field`);
  return field;
};

const fieldOf = (contentType: string, name: string): Field =>
  fieldIn(contentTypeNamed(ir, contentType).fields, contentType, name);

const componentField = (component: string, name: string): Field => {
  const found = ir.components.find((c) => c.name === component);
  if (found === undefined) throw new Error(`camis.json has no "${component}" component`);
  return fieldIn(found.fields, component, name);
};

const patternOf = (field: Field): RegExp => {
  if (field.pattern === undefined) throw new Error(`${field.name} has no pattern`);
  return new RegExp(field.pattern);
};

const ingestEvent = () => {
  const endpoint = ir.endpoints?.find((e) => e.name === "IngestEvent");
  if (endpoint === undefined) throw new Error("camis.json has no IngestEvent endpoint");
  return endpoint;
};

describe("Event, as the SDK sends it", () => {
  it("takes an event name by the wire's own pattern", () => {
    expect(fieldOf("Event", "name").pattern).toBe(EVENT_NAME_PATTERN.source);
  });

  it("takes events without a session or a path, as the wire allows", () => {
    expect(fieldOf("Event", "sessionId").required).not.toBe(true);
    expect(fieldOf("Event", "path").required).not.toBe(true);
  });

  it("holds a path as long as the wire's", () => {
    expect(fieldOf("Event", "path").maxLength).toBe(MAX_PATH_LENGTH);
  });

  it("de-duplicates by a unique SHA-256 in hex", () => {
    const dedupeKey = fieldOf("Event", "dedupeKey");
    expect(dedupeKey).toMatchObject({ type: "string", required: true, unique: true });
    const pattern = patternOf(dedupeKey);
    expect(pattern.test("a".repeat(64))).toBe(true);
    expect(pattern.test("A".repeat(64))).toBe(false);
    expect(pattern.test("a".repeat(63))).toBe(false);
  });
});

describe("Property, what its key may send", () => {
  it("lists its allowed events as a repeatable component", () => {
    expect(fieldOf("Property", "allowedEvents")).toMatchObject({
      type: "component",
      component: "AllowedEvent",
      repeatable: true,
    });
  });

  it("names an allowed event and its property keys by the wire's patterns", () => {
    expect(componentField("AllowedEvent", "name")).toMatchObject({
      required: true,
      pattern: EVENT_NAME_PATTERN.source,
    });
    expect(componentField("AllowedEvent", "propertyKeys")).toMatchObject({
      type: "component",
      component: "AllowedPropertyKey",
      repeatable: true,
    });
    expect(componentField("AllowedPropertyKey", "key")).toMatchObject({
      required: true,
      pattern: PROPERTY_KEY_PATTERN.source,
    });
  });

  it("lists the query parameters a path keeps, by names the URL parser leaves as they are", () => {
    expect(fieldOf("Property", "allowedQueryParams")).toMatchObject({
      type: "component",
      component: "AllowedQueryParam",
      repeatable: true,
    });
    const name = componentField("AllowedQueryParam", "name");
    expect(name.required).toBe(true);
    const pattern = patternOf(name);
    for (const valid of ["utm_source", "ref", "page.v-2"]) expect(pattern.test(valid)).toBe(true);
    for (const invalid of ["", "a b", "a=b", "a&b", "ä", "a%20"])
      expect(pattern.test(invalid)).toBe(false);
  });
});

describe("IngestEvent's declared guards", () => {
  it("refuses a body larger than the SDK may send", () => {
    expect(ingestEvent().maxBodyBytes).toBe(MAX_TRACKING_BATCH_BYTES);
  });

  it("accepts exactly the SDK's two body types: fetch's JSON and a beacon's text", () => {
    expect(ingestEvent().accepts).toEqual(["application/json", "text/plain"]);
  });

  it("answers browsers on any origin with exactly the SDK's request headers", () => {
    expect(ingestEvent().crossOrigin).toEqual({ headers: ["Content-Type", "X-Idg-Write-Key"] });
  });

  it("throttles each client address", () => {
    const perMinute = ingestEvent().throttle?.perMinute ?? 0;
    expect(Number.isInteger(perMinute) && perMinute > 0).toBe(true);
  });
});
