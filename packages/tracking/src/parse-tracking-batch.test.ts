import { describe, expect, it } from "vitest";
import { parseTrackingBatch, parseTrackingEvent } from "./parse-tracking-batch.ts";

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
  events: [event()],
  ...overrides,
});

const rejected = (input: unknown): string => {
  const result = parseTrackingBatch(input);
  if (result.ok) throw new Error("expected a rejection");
  return result.error;
};

describe("parseTrackingBatch", () => {
  it("accepts a minimal batch and returns it unchanged", () => {
    const result = parseTrackingBatch(batch());
    expect(result).toEqual({ ok: true, value: batch() });
  });

  it("accepts every optional field", () => {
    const full = batch({
      writeKey: "k".repeat(16),
      events: [
        event({
          user: "user_42-A",
          path: "/pricing?utm_source=news",
          referrer: "https://www.example.org",
          properties: { plan: "pro", seats: 3, trial: false, constructor: "x" },
        }),
      ],
    });
    expect(parseTrackingBatch(full)).toEqual({ ok: true, value: full });
  });

  it("accepts a batch that went through JSON", () => {
    const sent = JSON.parse(JSON.stringify(batch())) as unknown;
    expect(parseTrackingBatch(sent).ok).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "x"],
    ["an array", [batch()]],
    ["a number", 1],
    ["a Map", new Map()],
    ["a class instance", new URL("https://example.com")],
  ])("rejects %s", (_label, input) => {
    expect(parseTrackingBatch(input).ok).toBe(false);
  });

  it.each([
    ["a missing version", { sentAt: 1, events: [event()] }],
    ["another version", batch({ v: 2 })],
    ["a missing sentAt", { v: 1, events: [event()] }],
    ["a fractional sentAt", batch({ sentAt: 1.5 })],
    ["a negative sentAt", batch({ sentAt: -1 })],
    ["a sentAt beyond the Date range", batch({ sentAt: 8.64e15 + 1 })],
    ["a missing events list", { v: 1, sentAt: 1 }],
    ["an empty events list", batch({ events: [] })],
    ["events that are not a list", batch({ events: {} })],
    ["more than 500 events", batch({ events: Array.from({ length: 501 }, () => event()) })],
    ["an unknown key", batch({ extra: 1 })],
    ["a short write key", batch({ writeKey: "short" })],
    ["a write key with a symbol", batch({ writeKey: `${"k".repeat(16)}!` })],
  ])("rejects %s", (_label, input) => {
    expect(parseTrackingBatch(input).ok).toBe(false);
  });

  it("locates the event and the property that fail", () => {
    const error = rejected(
      batch({ events: [event(), event({ properties: { plan: { nested: 1 } } })] }),
    );
    expect(error).toContain("events[1].properties.plan");
  });

  it("names the rule of an unknown key", () => {
    expect(rejected(batch({ events: [event({ ip: "1.2.3.4" })] }))).toContain("events[0].ip");
  });
});

describe("parseTrackingEvent", () => {
  it.each([
    ["an upper-case name", event({ name: "Signup" })],
    ["a name starting with a digit", event({ name: "1st" })],
    ["a name over 64 characters", event({ name: `a${"b".repeat(64)}` })],
    ["an empty name", event({ name: "" })],
    ["a short id", event({ id: "short" })],
    ["an id with a symbol", event({ id: "AAAAAAAAAAAAAAAA+/==" })],
    ["a short session", event({ session: "short" })],
    ["a fractional timestamp", event({ at: 1.5 })],
    ["a missing timestamp", { id: "AAAAAAAAAAAAAAAAAAAAAA", name: "a", session: "B".repeat(22) }],
    ["a user with an at sign", event({ user: "ada@example.com" })],
    ["an empty user", event({ user: "" })],
    ["a user over 64 characters", event({ user: "u".repeat(65) })],
    ["a path without a leading slash", event({ path: "pricing" })],
    ["a path with a fragment", event({ path: "/a#b" })],
    ["a path with a space", event({ path: "/a b" })],
    ["a path with a non-ASCII character", event({ path: "/ä" })],
    ["an absolute URL as a path", event({ path: "https://example.com/a" })],
    ["a path over 2048 characters", event({ path: `/${"a".repeat(2048)}` })],
    ["a referrer with a path", event({ referrer: "https://example.org/page" })],
    ["a referrer with credentials", event({ referrer: "https://u:p@example.org" })],
    ["a javascript: referrer", event({ referrer: "javascript:alert(1)" })],
    ["properties that are not a record", event({ properties: [1] })],
    ["a null property", event({ properties: { a: null } })],
    ["an array property", event({ properties: { a: [1] } })],
    ["a nested property", event({ properties: { a: { b: 1 } } })],
    ["a property key in upper case", event({ properties: { Plan: "x" } })],
    ["a string over 1024 units", event({ properties: { a: "x".repeat(1025) } })],
    ["a lone high surrogate", event({ properties: { a: "x\ud800" } })],
    ["a lone low surrogate", event({ properties: { a: "\udc00x" } })],
    ["a lone surrogate in the path", event({ path: "/\ud800" })],
    [
      "more than 32 properties",
      event({
        properties: Object.fromEntries(Array.from({ length: 33 }, (_v, i) => [`p${String(i)}`, i])),
      }),
    ],
  ])("rejects %s", (_label, input) => {
    expect(parseTrackingEvent(input).ok).toBe(false);
  });

  it("accepts 1024 units of a string and 32 properties", () => {
    const properties = Object.fromEntries(
      Array.from({ length: 32 }, (_v, i) => [`p${String(i)}`, "x".repeat(1024)]),
    );
    expect(parseTrackingEvent(event({ properties })).ok).toBe(true);
  });

  it("accepts a string with a well-formed surrogate pair", () => {
    expect(parseTrackingEvent(event({ properties: { a: "x\u{1f600}" } })).ok).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity])("rejects the number %s", (value) => {
    expect(parseTrackingEvent(event({ properties: { a: value } })).ok).toBe(false);
  });

  it("accepts a finite negative or fractional number", () => {
    expect(parseTrackingEvent(event({ properties: { a: -1.5e300 } })).ok).toBe(true);
  });

  describe("prototype pollution", () => {
    const polluted = (json: string): unknown => JSON.parse(json) as unknown;

    it.each([
      ["the batch", `{"v":1,"sentAt":1,"__proto__":{"x":1},"events":[]}`],
      [
        "an event",
        `{"v":1,"sentAt":1,"events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"a","at":1,"session":"BBBBBBBBBBBBBBBBBBBBBB","__proto__":{"x":1}}]}`,
      ],
      [
        "the properties",
        `{"v":1,"sentAt":1,"events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"a","at":1,"session":"BBBBBBBBBBBBBBBBBBBBBB","properties":{"__proto__":1}}]}`,
      ],
    ])("rejects an own __proto__ key on %s", (_label, json) => {
      expect(parseTrackingBatch(polluted(json)).ok).toBe(false);
    });

    it("keeps constructor as an ordinary property key and pollutes nothing", () => {
      const result = parseTrackingEvent(event({ properties: { constructor: "x", prototype: 1 } }));
      expect(result.ok).toBe(true);
      expect(({} as Record<string, unknown>).constructor).toBe(Object);
      expect(
        Object.getPrototypeOf((result as { value: { properties: object } }).value.properties),
      ).toBe(Object.prototype);
    });

    it("rejects a prototype-less record's inherited surprises", () => {
      const properties = Object.create(null) as Record<string, unknown>;
      properties.a = 1;
      expect(parseTrackingEvent(event({ properties })).ok).toBe(true);
    });
  });
});
