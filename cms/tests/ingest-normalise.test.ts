import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { WireEvent } from "../protected/src/ingest/batch.ts";
import {
  dedupeKeyOf,
  eventRowOf,
  occurredAtOf,
  pathOf,
  propertiesOf,
  referrerHostOf,
  type IngestPolicy,
} from "../protected/src/ingest/normalise.ts";
import { contentTypeNamed, loadIr } from "./model";

interface NormaliseVectors {
  paths: { path: string; allowed: string[]; stored: string }[];
  referrers: { referrer: string; stored: string | null }[];
}

// Shared with the strapi-php handler's PHPUnit tests, so both targets store alike.
const vectors = JSON.parse(
  readFileSync(new URL("./fixtures/ingest-normalise-vectors.json", import.meta.url), "utf8"),
) as NormaliseVectors;

const eventField = (name: string): RegExp =>
  new RegExp(
    contentTypeNamed(loadIr(), "Event").fields.find((field) => field.name === name)?.pattern ??
      "(?!)",
  );

const policy: IngestPolicy = {
  allowedEvents: new Map([
    ["signup_completed", new Set(["plan", "seats"])],
    ["clicked", new Set<string>()],
  ]),
  allowedQueryParams: new Set(["utm_source"]),
};

const event = (fields: Partial<WireEvent> = {}): WireEvent => ({
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  name: "signup_completed",
  at: 1_700_000_000_000,
  ...fields,
});

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

describe("pathOf", () => {
  it.each(vectors.paths.map((vector) => [vector.path, vector] as const))(
    "%s keeps only the allowed query parameters",
    (_path, vector) => {
      const stored = pathOf(vector.path, new Set(vector.allowed));
      expect(stored).toBe(vector.stored);
      expect(eventField("path").test(stored)).toBe(true);
    },
  );
});

describe("referrerHostOf", () => {
  it.each(vectors.referrers.map((vector) => [vector.referrer, vector] as const))(
    "%s is stored as its host name only",
    (_referrer, vector) => {
      const stored = referrerHostOf(vector.referrer);
      expect(stored).toBe(vector.stored);
      if (stored !== null) expect(eventField("referrerHost").test(stored)).toBe(true);
    },
  );
});

describe("occurredAtOf", () => {
  it("moves the event by the client's clock skew", () => {
    expect(occurredAtOf(1_000, 3_000, NOW)?.getTime()).toBe(NOW - 2_000);
  });

  it("accepts an event 25 hours old and one 5 minutes ahead, and nothing beyond", () => {
    expect(occurredAtOf(NOW - 25 * HOUR, NOW, NOW)?.getTime()).toBe(NOW - 25 * HOUR);
    expect(occurredAtOf(NOW - 25 * HOUR - 1, NOW, NOW)).toBeUndefined();
    expect(occurredAtOf(NOW + 300_000, NOW, NOW)?.getTime()).toBe(NOW + 300_000);
    expect(occurredAtOf(NOW + 300_001, NOW, NOW)).toBeUndefined();
  });

  it("judges the corrected time, not the client's", () => {
    // A client clock a day slow sends a fresh event: kept, at the server's time.
    expect(occurredAtOf(NOW - 24 * HOUR, NOW - 24 * HOUR, NOW)?.getTime()).toBe(NOW);
    // An event the client says is fresh, in a batch it says it sent two days later: too old.
    expect(occurredAtOf(NOW, NOW + 48 * HOUR, NOW)).toBeUndefined();
  });
});

describe("propertiesOf", () => {
  it("keeps a page view, without properties", () => {
    expect(propertiesOf(event({ name: "page_view", properties: { plan: "x" } }), policy)).toBe(
      null,
    );
  });

  it("skips an event the property does not list", () => {
    expect(propertiesOf(event({ name: "other" }), policy)).toBeUndefined();
  });

  it("keeps only the listed keys of a listed event", () => {
    expect(
      propertiesOf(event({ properties: { plan: "pro", seats: 3, email: "a@b.c" } }), policy),
    ).toEqual({ plan: "pro", seats: 3 });
  });

  it("stores no properties when none is listed or none is left", () => {
    expect(propertiesOf(event({ name: "clicked", properties: { plan: "x" } }), policy)).toBe(null);
    expect(propertiesOf(event({ properties: { email: "a@b.c" } }), policy)).toBe(null);
    expect(propertiesOf(event(), policy)).toBe(null);
  });
});

describe("dedupeKeyOf", () => {
  it("is the SHA-256 of the property id and the event id", () => {
    expect(dedupeKeyOf(7, "AAAAAAAAAAAAAAAAAAAAAA")).toBe(
      createHash("sha256").update("7:AAAAAAAAAAAAAAAAAAAAAA").digest("hex"),
    );
    expect(eventField("dedupeKey").test(dedupeKeyOf(7, "x"))).toBe(true);
  });

  it("differs between properties for one event id", () => {
    expect(dedupeKeyOf(1, "AAAAAAAAAAAAAAAAAAAAAA")).not.toBe(
      dedupeKeyOf(2, "AAAAAAAAAAAAAAAAAAAAAA"),
    );
  });
});

describe("eventRowOf", () => {
  const context = { propertyId: 7, sentAt: NOW, now: NOW };

  it("keeps what the model holds and drops the visitor's user id", () => {
    const row = eventRowOf(
      event({
        at: NOW - 1_000,
        session: "BBBBBBBBBBBBBBBBBBBBBB",
        user: "u_42",
        path: "/p?utm_source=x&email=y",
        referrer: "https://News.example.org",
        properties: { plan: "pro", email: "a@b.c" },
      }),
      context,
      policy,
    );
    expect(row).toEqual({
      name: "signup_completed",
      dedupeKey: dedupeKeyOf(7, "AAAAAAAAAAAAAAAAAAAAAA"),
      occurredAt: new Date(NOW - 1_000),
      sessionId: "BBBBBBBBBBBBBBBBBBBBBB",
      path: "/p?utm_source=x",
      referrerHost: "news.example.org",
      properties: { plan: "pro" },
    });
    expect(JSON.stringify(row)).not.toContain("u_42");
  });

  it("stores no session, path or referrer the event lacks", () => {
    expect(eventRowOf(event({ at: NOW }), context, policy)).toMatchObject({
      sessionId: null,
      path: null,
      referrerHost: null,
    });
  });

  it("skips an event outside the window or not allowed", () => {
    expect(eventRowOf(event({ at: NOW - 26 * HOUR }), context, policy)).toBeUndefined();
    expect(eventRowOf(event({ at: NOW, name: "other" }), context, policy)).toBeUndefined();
  });
});
