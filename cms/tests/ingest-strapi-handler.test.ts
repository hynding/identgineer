import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import controller, {
  type IngestContext,
} from "../protected/src/api/event/controllers/ingest-event.ts";
import { dedupeKeyOf } from "../protected/src/ingest/normalise.ts";
import type { DocumentServiceLike, StrapiLike } from "../protected/src/ingest/strapi-ports.ts";

// The Strapi handler through its controller, against a stand-in for Strapi's document service
// (Strapi itself is not installed here). Each refusal the issue lists, and what is stored.

const KEY = "pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_KEY = "pk_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const ORIGIN = "https://shop.example.com";
const NOW = Date.UTC(2026, 10, 27, 12);
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const ADDRESS = "203.0.113.9";

interface PropertyRow {
  id: number;
  documentId: string;
  ingestKey: string;
  active: boolean;
  owner: { documentId: string };
  allowedOrigins: { origin: string }[];
  allowedEvents: { name: string; propertyKeys: { key: string }[] }[];
  allowedQueryParams: { name: string }[];
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 1));

const filterValue = (params: Record<string, unknown>, field: string): unknown =>
  ((params.filters as Record<string, { $eq: unknown } | undefined>)[field] ?? { $eq: undefined })
    .$eq;

/** Strapi's document service over two in-memory tables, a moment's pause in every call. */
const fakeStrapi = (properties: PropertyRow[]) => {
  const events: Record<string, unknown>[] = [];
  const queries: Record<string, unknown>[] = [];
  const services: Record<string, DocumentServiceLike> = {
    "api::property.property": {
      async findFirst(params) {
        queries.push(params);
        await pause();
        const key = filterValue(params, "ingestKey");
        const active = filterValue(params, "active");
        const row = properties.find((p) => p.ingestKey === key && p.active === active);
        return row === undefined ? null : { ...row };
      },
      create() {
        return Promise.reject(new Error("the handler never writes a property"));
      },
    },
    "api::event.event": {
      async findFirst(params) {
        await pause();
        const key = filterValue(params, "dedupeKey");
        return events.find((e) => e.dedupeKey === key) ?? null;
      },
      async create({ data }) {
        await pause();
        events.push(data);
        return data;
      },
    },
  };
  const strapi: StrapiLike = {
    documents: (uid) => {
      const service = services[uid];
      if (service === undefined) throw new Error(`unexpected uid ${uid}`);
      return service;
    },
  };
  return { strapi, events, queries };
};

const property = (fields: Partial<PropertyRow> = {}): PropertyRow => ({
  id: 7,
  documentId: "prop7",
  ingestKey: KEY,
  active: true,
  owner: { documentId: "owner1" },
  allowedOrigins: [{ origin: ORIGIN }],
  allowedEvents: [{ name: "signup_completed", propertyKeys: [{ key: "plan" }] }],
  allowedQueryParams: [{ name: "utm_source" }],
  ...fields,
});

interface Sent {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

const wireEvent = (fields: Record<string, unknown> = {}) => ({
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  name: "signup_completed",
  at: NOW - 1_000,
  session: "SSSSSSSSSSSSSSSSSSSSSS",
  ...fields,
});

const batchOf = (fields: Record<string, unknown> = {}) => ({
  v: 1,
  sentAt: NOW,
  transport: "fetch",
  events: [wireEvent()],
  ...fields,
});

const beaconOf = (fields: Record<string, unknown> = {}) =>
  batchOf({ transport: "beacon", writeKey: KEY, ...fields });

/** A request as koa-body leaves it: JSON parsed, text/plain as text, every header lower case. */
const send = async (
  handler: { handle: (context: IngestContext) => Promise<void> },
  options: {
    body: unknown;
    type?: string;
    key?: string | null;
    origin?: string | null;
    length?: string;
  },
): Promise<Sent> => {
  const sent: Sent = { status: 404, body: undefined, headers: {} };
  const text = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    "content-type": options.type ?? "application/json",
    "content-length": options.length ?? String(Buffer.byteLength(text)),
    "user-agent": USER_AGENT,
    "x-forwarded-for": ADDRESS,
  };
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.key !== null) headers["x-idg-write-key"] = options.key ?? KEY;
  const context: IngestContext = {
    request: { headers, body: options.body },
    get status() {
      return sent.status;
    },
    set status(value) {
      sent.status = value;
    },
    get body() {
      return sent.body;
    },
    set body(value) {
      sent.body = value;
    },
    set(field, value) {
      sent.headers[field] = value;
    },
  };
  await handler.handle(context);
  return sent;
};

let backend: ReturnType<typeof fakeStrapi>;
let handler: ReturnType<typeof controller>;

const boot = (properties: PropertyRow[], env: Record<string, string> = {}) => {
  vi.stubEnv("INGEST_MAX_BODY_BYTES", env.INGEST_MAX_BODY_BYTES ?? "");
  vi.stubEnv("INGEST_KEY_RATE_PER_MINUTE", env.INGEST_KEY_RATE_PER_MINUTE ?? "");
  backend = fakeStrapi(properties);
  handler = controller({ strapi: backend.strapi });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  boot([property()]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const NOT_FOUND = {
  data: null,
  error: { status: 404, name: "NotFoundError", message: "Not Found", details: {} },
};

describe("the Strapi ingestion handler accepts", () => {
  it("a fetch batch: 202, no body, one row against the key's property", async () => {
    const answer = await send(handler, { body: batchOf() });
    expect(answer).toEqual({ status: 202, body: "", headers: {} });
    expect(backend.events).toEqual([
      {
        name: "signup_completed",
        dedupeKey: dedupeKeyOf(7, "AAAAAAAAAAAAAAAAAAAAAA"),
        occurredAt: new Date(NOW - 1_000).toISOString(),
        sessionId: "SSSSSSSSSSSSSSSSSSSSSS",
        path: null,
        referrerHost: null,
        properties: null,
        property: "prop7",
        owner: "owner1",
      },
    ]);
  });

  it("a beacon: text/plain with the key in the body, and no header", async () => {
    const answer = await send(handler, {
      body: JSON.stringify(beaconOf()),
      type: "text/plain;charset=UTF-8",
      key: null,
    });
    expect(answer.status).toBe(202);
    expect(backend.events).toHaveLength(1);
  });

  it("a beacon's key, not a header, when both are sent", async () => {
    boot([property(), property({ id: 8, documentId: "prop8", ingestKey: OTHER_KEY })]);
    await send(handler, { body: JSON.stringify(beaconOf()), type: "text/plain", key: OTHER_KEY });
    expect(backend.events.map((e) => e.property)).toEqual(["prop7"]);
  });

  it("the property and owner of the key only, whatever the body names", async () => {
    const body = batchOf({ events: [wireEvent({ properties: { plan: "x" } })] });
    await send(handler, { body: { ...body, property: 99 } });
    expect(backend.events).toEqual([]);
    await send(handler, { body });
    expect(backend.events[0]).toMatchObject({ property: "prop7", owner: "owner1" });
  });

  it("a repeated event once, and the repeat still answered 202", async () => {
    expect((await send(handler, { body: batchOf() })).status).toBe(202);
    expect((await send(handler, { body: batchOf() })).status).toBe(202);
    expect(backend.events).toHaveLength(1);
  });

  it("a repeated event once when the two requests race", async () => {
    const answers = await Promise.all([
      send(handler, { body: batchOf() }),
      send(handler, { body: batchOf() }),
      send(handler, { body: JSON.stringify(beaconOf()), type: "text/plain", key: null }),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual([202, 202, 202]);
    expect(backend.events).toHaveLength(1);
  });

  it("one event id on two properties as two events", async () => {
    boot([property(), property({ id: 8, documentId: "prop8", ingestKey: OTHER_KEY })]);
    await send(handler, { body: batchOf() });
    await send(handler, { body: batchOf(), key: OTHER_KEY });
    expect(backend.events.map((e) => e.property)).toEqual(["prop7", "prop8"]);
  });

  it("but skips events not allowed or outside the window, still answering 202", async () => {
    const answer = await send(handler, {
      body: batchOf({
        events: [
          wireEvent({ id: "A".repeat(22), name: "unlisted" }),
          wireEvent({ id: "B".repeat(22), at: NOW - 26 * 3_600_000 }),
          wireEvent({ id: "C".repeat(22), at: NOW + 600_000 }),
          wireEvent({ id: "D".repeat(22), name: "page_view", properties: { plan: "x" } }),
        ],
      }),
    });
    expect(answer.status).toBe(202);
    expect(backend.events.map((e) => [e.name, e.properties])).toEqual([["page_view", null]]);
  });

  it("and stores what the model keeps, never the user id, address, user agent or key", async () => {
    await send(handler, {
      body: batchOf({
        events: [
          wireEvent({
            user: "visitor_42",
            path: "/p?utm_source=news&email=ada%40example.com",
            referrer: "https://News.example.org",
            properties: { plan: "pro", email: "x" },
          }),
        ],
      }),
    });
    expect(backend.events[0]).toMatchObject({
      path: "/p?utm_source=news",
      referrerHost: "news.example.org",
      properties: { plan: "pro" },
    });
    const stored = JSON.stringify(backend.events);
    for (const secret of ["visitor_42", ADDRESS, "Firefox", KEY, "email"]) {
      expect(stored).not.toContain(secret);
    }
  });
});

describe("the Strapi ingestion handler refuses", () => {
  it("another body type with 415", async () => {
    const answer = await send(handler, { body: "x", type: "application/x-www-form-urlencoded" });
    expect(answer.status).toBe(415);
  });

  it("a body over INGEST_MAX_BODY_BYTES with 413, before parsing it", async () => {
    boot([property()], { INGEST_MAX_BODY_BYTES: "100" });
    expect((await send(handler, { body: "{".repeat(101), type: "text/plain" })).status).toBe(413);
    expect((await send(handler, { body: batchOf(), length: "101" })).status).toBe(413);
  });

  it.each([
    ["not JSON", "{"],
    ["an unknown field", JSON.stringify(batchOf({ extra: 1 }))],
    ["a write key in a fetch batch", JSON.stringify(batchOf({ writeKey: KEY }))],
  ])("an invalid batch (%s) with 400, storing nothing", async (_label, body) => {
    expect((await send(handler, { body, type: "text/plain" })).status).toBe(400);
    expect(backend.events).toEqual([]);
  });

  it("a whole batch when one event is invalid", async () => {
    const body = batchOf({ events: [wireEvent(), wireEvent({ id: "short" })] });
    expect((await send(handler, { body })).status).toBe(400);
    expect(backend.events).toEqual([]);
  });

  it("an unknown key and an inactive key alike: 404, the same body", async () => {
    const unknown = await send(handler, { body: batchOf(), key: OTHER_KEY });
    boot([property({ active: false })]);
    const inactive = await send(handler, { body: batchOf() });
    expect(unknown).toEqual({ status: 404, body: NOT_FOUND, headers: {} });
    expect(inactive).toEqual(unknown);
    expect(backend.events).toEqual([]);
  });

  it("looks the key up with its active flag in one query", async () => {
    await send(handler, { body: batchOf() });
    expect(backend.queries).toHaveLength(1);
    expect(backend.queries[0]?.filters).toEqual({
      ingestKey: { $eq: KEY },
      active: { $eq: true },
    });
  });

  it.each([
    ["a fetch without the header", { key: null }],
    ["a malformed header", { key: "pk_short" }],
  ])("%s with 404", async (_label, options) => {
    expect((await send(handler, { body: batchOf(), ...options })).status).toBe(404);
    expect(backend.queries).toHaveLength(0);
  });

  it.each([
    ["no Origin", null],
    ["another origin", "https://evil.example"],
    ["the origin over http", "http://shop.example.com"],
    ["an opaque origin", "null"],
  ])("%s with 403", async (_label, origin) => {
    expect((await send(handler, { body: batchOf(), origin })).status).toBe(403);
    expect(backend.events).toEqual([]);
  });

  it("a key over INGEST_KEY_RATE_PER_MINUTE with 429 and Retry-After", async () => {
    boot([property()], { INGEST_KEY_RATE_PER_MINUTE: "2" });
    await send(handler, { body: batchOf({ events: [wireEvent({ id: "A".repeat(22) })] }) });
    await send(handler, { body: batchOf({ events: [wireEvent({ id: "B".repeat(22) })] }) });
    const limited = await send(handler, {
      body: batchOf({ events: [wireEvent({ id: "C".repeat(22) })] }),
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers["Retry-After"])).toBeGreaterThanOrEqual(1);
    expect(backend.events).toHaveLength(2);
  });

  it("counts the rate per key, not per handler", async () => {
    boot([property(), property({ id: 8, documentId: "prop8", ingestKey: OTHER_KEY })], {
      INGEST_KEY_RATE_PER_MINUTE: "1",
    });
    expect((await send(handler, { body: batchOf() })).status).toBe(202);
    expect((await send(handler, { body: batchOf(), key: OTHER_KEY })).status).toBe(202);
    expect((await send(handler, { body: batchOf() })).status).toBe(429);
  });
});
