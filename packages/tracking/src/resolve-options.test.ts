import { describe, expect, it } from "vitest";
import { TRACKER_DEFAULTS } from "./defaults.ts";
import { resolveOptions } from "./resolve-options.ts";

const WRITE_KEY = "wk_0123456789abcdef";
const base = { endpoint: "https://collect.example.com/v1/events", writeKey: WRITE_KEY, events: {} };
const resolve = (overrides: Record<string, unknown> = {}) =>
  resolveOptions({ ...base, ...overrides });

describe("resolveOptions", () => {
  it("fills every default", () => {
    const resolved = resolve();
    expect(resolved).toMatchObject({
      endpoint: "https://collect.example.com/v1/events",
      writeKey: WRITE_KEY,
      consentVersion: 1,
      autoPageViews: false,
      maxStringLength: 256,
      maxBatchSize: 20,
      flushInterval: 5000,
      maxPayloadBytes: 32_768,
      maxQueueEvents: 200,
      maxQueueBytes: 102_400,
      sessionTimeout: 1_800_000,
    });
    expect([...resolved.allowedQueryParameters]).toEqual([]);
  });

  it("lists the defaults in one place for the documentation", () => {
    expect(TRACKER_DEFAULTS).toEqual({
      consentVersion: 1,
      autoPageViews: false,
      allowedQueryParameters: [],
      maxStringLength: 256,
      maxBatchSize: 20,
      flushInterval: 5000,
      maxPayloadBytes: 32_768,
      maxQueueEvents: 200,
      maxQueueBytes: 102_400,
      sessionTimeout: 1_800_000,
    });
  });

  it.each([
    "https://collect.example.com/v1/events",
    "https://collect.example.com",
    "https://collect.example.com:8443/in",
    "http://localhost:8080/events",
    "http://127.0.0.1/events",
    "https://localhost/events",
  ])("accepts the endpoint %s", (endpoint) => {
    expect(resolve({ endpoint }).endpoint).toBe(new URL(endpoint).href);
  });

  it.each([
    ["http to a public host", "http://collect.example.com/v1"],
    ["a relative URL", "/v1/events"],
    ["a protocol-relative URL", "//collect.example.com/v1"],
    ["an empty string", ""],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/plain,hi"],
    ["a file: URL", "file:///tmp/x"],
    ["credentials", "https://ada:secret@collect.example.com/v1"],
    ["a query string", "https://collect.example.com/v1?key=abc"],
    ["a fragment", "https://collect.example.com/v1#x"],
    ["http to a look-alike of localhost", "http://localhost.evil.example/v1"],
    ["http to 127.0.0.1 as a subdomain", "http://127.0.0.1.evil.example/v1"],
    ["http to another loopback address", "http://127.0.0.2/v1"],
    ["a non-string", 5],
    ["undefined", undefined],
  ])("throws for an endpoint that is %s", (_label, endpoint) => {
    expect(() => resolve({ endpoint })).toThrow(TypeError);
    expect(() => resolve({ endpoint })).toThrow(/options\.endpoint/);
  });

  it.each([
    ["too short", "a".repeat(15)],
    ["too long", "a".repeat(129)],
    ["with a symbol", `${"a".repeat(16)}!`],
    ["with a space", `${"a".repeat(16)} `],
    ["empty", ""],
    ["a number", 1234567890123456],
    ["undefined", undefined],
  ])("throws for a write key that is %s", (_label, writeKey) => {
    expect(() => resolve({ writeKey })).toThrow(/options\.writeKey/);
  });

  it("accepts the shortest and the longest write key", () => {
    expect(() => resolve({ writeKey: "a".repeat(16) })).not.toThrow();
    expect(() => resolve({ writeKey: "A-_".repeat(42) + "ab" })).not.toThrow();
  });

  it("never puts the write key in an error message", () => {
    try {
      resolve({ endpoint: "http://collect.example.com/v1" });
    } catch (error) {
      expect((error as Error).message).not.toContain(WRITE_KEY);
    }
  });

  it("checks the event declarations", () => {
    expect(() => resolve({ events: { Bad: { properties: {} } } })).toThrow(/options\.events/);
    expect(() => resolve({ events: undefined })).toThrow(/options\.events/);
  });

  it.each([
    ["consentVersion", 0],
    ["consentVersion", 1.5],
    ["consentVersion", "1"],
    ["maxStringLength", 0],
    ["maxStringLength", 1025],
    ["maxBatchSize", 0],
    ["maxBatchSize", 501],
    ["flushInterval", 0],
    ["flushInterval", 86_400_001],
    ["maxPayloadBytes", 1023],
    ["maxPayloadBytes", 65_537],
    ["maxQueueEvents", 0],
    ["maxQueueEvents", 10_001],
    ["maxQueueBytes", 1023],
    ["maxQueueBytes", 4_194_305],
    ["sessionTimeout", 999],
    ["sessionTimeout", 86_400_001],
    ["flushInterval", Number.NaN],
    ["flushInterval", Infinity],
  ])("throws for %s of %j", (name, value) => {
    expect(() => resolve({ [name]: value })).toThrow(TypeError);
    expect(() => resolve({ [name]: value })).toThrow(new RegExp(`options\\.${name}`));
  });

  it("accepts the bounds themselves", () => {
    expect(() =>
      resolve({
        maxStringLength: 1024,
        maxBatchSize: 500,
        flushInterval: 1,
        maxPayloadBytes: 65_536,
        maxQueueEvents: 10_000,
        maxQueueBytes: 4_194_304,
        sessionTimeout: 1000,
      }),
    ).not.toThrow();
  });

  it("takes the allowed query parameters as a set and checks each name", () => {
    expect([
      ...resolve({ allowedQueryParameters: ["utm_source", "ref"] }).allowedQueryParameters,
    ]).toEqual(["utm_source", "ref"]);
    for (const bad of [["a b"], [""], ["a".repeat(65)], [5], "utm_source", ["a=b"], ["a&b"]]) {
      expect(() => resolve({ allowedQueryParameters: bad })).toThrow(
        /options\.allowedQueryParameters/,
      );
    }
  });

  it("copes with an options object that is not one", () => {
    expect(() => resolveOptions(null as never)).toThrow(TypeError);
    expect(() => resolveOptions(undefined as never)).toThrow(TypeError);
  });

  it("uses what is injected and treats null as switched off", () => {
    const fetch = () => Promise.reject(new Error("unused"));
    const resolved = resolve({
      fetch,
      sendBeacon: null,
      localStorage: null,
      crypto: null,
      crossTab: null,
    });
    expect(resolved.fetch).toBe(fetch);
    expect(resolved.sendBeacon).toBeUndefined();
    expect(resolved.localStorage).toBeUndefined();
    expect(resolved.crypto).toBeUndefined();
    expect(resolved.crossTab).toBeUndefined();
  });
});
