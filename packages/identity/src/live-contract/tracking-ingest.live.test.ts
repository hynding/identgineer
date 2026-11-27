import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTracker } from "../../../tracking/src/index.ts";
import { createFakePage, createMemoryStorage } from "../../../tracking/src/testing/index.ts";
import type { Tracker } from "../../../tracking/src/index.ts";
import { createBrowserFetch } from "./browser-fetch.ts";
import { createCookieJar } from "./cookie-jar.ts";
import {
  freshAccount,
  liveBackend,
  post,
  SKIP_NOTE,
  type LiveBackend,
  type LiveServer,
} from "./live-backend.ts";

// @identgineer/tracking against strapi-php's POST /api/ingest/events: the real tracker, sending
// through a browser's fetch (CORS preflight included) and its beacon, and the rows stored. It lives
// here to share this harness; the tracking package does not depend on the identity package.

const backend = liveBackend ?? ({} as LiveBackend);

const SITE = "https://shop.example";
const ENDPOINT = "/api/ingest/events";
// Unique to the run, looked for in the database and the log at the end.
const USER_AGENT = `IngestLiveProbe/${randomBytes(8).toString("hex")}`;
const VISITOR = `visitor_${randomBytes(4).toString("hex")}`;

interface Owner {
  readonly jwt: string;
}

interface StoredEvent {
  readonly name: string;
  readonly dedupeKey: string;
  readonly occurredAt: string;
  readonly sessionId: string | null;
  readonly path: string | null;
  readonly referrerHost: string | null;
  readonly properties: Record<string, unknown> | null;
}

interface CreatedProperty {
  readonly documentId: string;
  readonly ingestKey: string;
}

const register = async (server: LiveServer, label: string): Promise<Owner> => {
  const answer = await post(server, "/api/auth/local/register", freshAccount(label));
  expect(answer.status).toBe(200);
  return { jwt: (answer.body as { jwt: string }).jwt };
};

const api = async (
  server: LiveServer,
  method: string,
  path: string,
  options: {
    readonly jwt?: string;
    readonly body?: unknown;
    readonly headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; body: unknown; text: string }> => {
  const response = await fetch(`${server.url}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.jwt === undefined ? {} : { Authorization: `Bearer ${options.jwt}` }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: response.status, body, text };
};

const PLACEHOLDER_KEY = `pk_${"A".repeat(40)}`;

/** A property the owner creates through the content API, as the dashboard will. */
const createProperty = async (
  server: LiveServer,
  owner: Owner,
  fields: Record<string, unknown> = {},
): Promise<CreatedProperty> => {
  const answer = await api(server, "POST", "/api/properties", {
    jwt: owner.jwt,
    body: {
      data: {
        name: "Shop",
        domain: "shop.example",
        // Required by the model; IssueIngestKey replaces whatever is sent.
        ingestKey: PLACEHOLDER_KEY,
        allowedOrigins: [{ origin: SITE }],
        allowedEvents: [{ name: "signup_completed", propertyKeys: [{ key: "plan" }] }],
        allowedQueryParams: [{ name: "utm_source" }],
        ...fields,
      },
    },
  });
  expect(answer.status, answer.text).toBeLessThan(300);
  return (answer.body as { data: CreatedProperty }).data;
};

const eventsOf = async (server: LiveServer, owner: Owner): Promise<StoredEvent[]> => {
  const answer = await api(
    server,
    "GET",
    "/api/events?sort=occurredAt:asc&pagination[pageSize]=25",
    {
      jwt: owner.jwt,
    },
  );
  expect(answer.status, answer.text).toBe(200);
  return (answer.body as { data: StoredEvent[] }).data;
};

const nowEvent = (fields: Record<string, unknown> = {}) => ({
  id: randomBytes(16).toString("base64url"),
  name: "signup_completed",
  at: Date.now() - 1_000,
  ...fields,
});

const batchText = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, sentAt: Date.now(), transport: "fetch", events: [nowEvent()], ...fields });

/** A request with the headers a page on `origin` sends, read without CORS to see the status. */
const ingest = async (
  server: LiveServer,
  body: string,
  options: { readonly key?: string; readonly origin?: string | null; readonly type?: string } = {},
): Promise<{ status: number; text: string; retryAfter: string | null }> => {
  const response = await fetch(`${server.url}${ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": options.type ?? "application/json",
      "User-Agent": USER_AGENT,
      ...(options.origin === null ? {} : { Origin: options.origin ?? SITE }),
      ...(options.key === undefined ? {} : { "X-Idg-Write-Key": options.key }),
    },
    body,
  });
  return {
    status: response.status,
    text: await response.text(),
    retryAfter: response.headers.get("Retry-After"),
  };
};

const trackers: Tracker[] = [];

/** The real tracker on a page of SITE, sending with a browser's fetch and beacon. */
const openPage = (server: LiveServer, writeKey: string, href: string, referrer = "") => {
  const browser = createBrowserFetch({
    jar: createCookieJar(),
    pageOrigin: SITE,
    userAgent: USER_AGENT,
  });
  // A beacon's answer is never read by the page, so it is sent past CORS and its status kept.
  const beaconNetwork = createBrowserFetch({
    jar: createCookieJar(),
    pageOrigin: SITE,
    cors: false,
    userAgent: USER_AGENT,
  });
  const beacons: Promise<number>[] = [];
  const page = createFakePage({ href, referrer });
  const tracker = createTracker({
    endpoint: `${server.url}${ENDPOINT}`,
    writeKey,
    events: { signup_completed: { properties: { plan: "string", seats: "number" } } },
    allowedQueryParameters: ["utm_source", "email"],
    fetch: browser.fetch,
    sendBeacon: (url, data) => {
      beacons.push(
        beaconNetwork
          .fetch(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: data,
            credentials: "include",
          })
          .then((response) => response.status),
      );
      return true;
    },
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    crossTab: null,
    page,
  });
  trackers.push(tracker);
  tracker.consent.grant();
  return { tracker, page, sent: browser.sent, beacons };
};

afterEach(() => {
  for (const tracker of trackers.splice(0)) tracker.dispose();
});

/** Laravel's log, which every server shares; empty before anything is logged. */
const readLog = (): string => {
  try {
    return readFileSync(backend.mailLog, "utf8");
  } catch {
    return "";
  }
};

describe.skipIf(liveBackend === undefined)(
  `event ingestion against strapi-php ${liveBackend === undefined ? SKIP_NOTE : ""}`,
  () => {
    const main = (): LiveServer => backend.servers.main;
    // What this file's requests add to the log, the other files having run before or after it.
    let logBefore = 0;
    beforeAll(() => {
      logBefore = readLog().length;
    });

    it("issues each new property a key of its own, never the one sent", async () => {
      const owner = await register(main(), "ingest-key");
      const first = await createProperty(main(), owner);
      const second = await createProperty(main(), owner);
      for (const property of [first, second]) {
        expect(property.ingestKey).toMatch(/^pk_[A-Za-z0-9]{40}$/);
        expect(property.ingestKey).not.toBe(PLACEHOLDER_KEY);
      }
      expect(first.ingestKey).not.toBe(second.ingestKey);
    });

    it("takes the tracker's fetch through a browser's preflight and stores what the model keeps", async () => {
      const owner = await register(main(), "ingest-fetch");
      const { ingestKey } = await createProperty(main(), owner);
      const { tracker, sent } = openPage(
        main(),
        ingestKey,
        `${SITE}/pricing?utm_source=news&email=ada%40example.com#top`,
        "https://News.Example.org/story?id=1",
      );
      tracker.identify(VISITOR);
      tracker.page();
      tracker.track("signup_completed", { plan: "pro", seats: 3 });
      await tracker.flush();

      expect(sent.map((request) => [request.method, request.status])).toEqual([
        ["OPTIONS", 204],
        ["POST", 202],
      ]);
      const events = await eventsOf(main(), owner);
      expect(
        events.map((event) => [event.name, event.path, event.referrerHost, event.properties]),
      ).toEqual([
        ["page_view", "/pricing?utm_source=news", "news.example.org", null],
        ["signup_completed", "/pricing?utm_source=news", null, { plan: "pro" }],
      ]);
      for (const event of events) {
        expect(event.dedupeKey).toMatch(/^[0-9a-f]{64}$/);
        expect(event.sessionId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
        expect(Math.abs(Date.parse(event.occurredAt) - Date.now())).toBeLessThan(60_000);
      }
      expect(JSON.stringify(events)).not.toContain(VISITOR);
    });

    it("takes the tracker's beacon when the page is hidden", async () => {
      const owner = await register(main(), "ingest-beacon");
      const { ingestKey } = await createProperty(main(), owner);
      const { tracker, page, beacons } = openPage(main(), ingestKey, `${SITE}/checkout`);
      tracker.track("signup_completed", { plan: "team" });
      page.hide();
      expect(beacons).toHaveLength(1);
      expect(await beacons[0]).toBe(202);
      const events = await eventsOf(main(), owner);
      expect(events.map((event) => [event.name, event.path, event.properties])).toEqual([
        ["signup_completed", "/checkout", { plan: "team" }],
      ]);
    });

    it("stores a repeated event once, and accepts the repeat", async () => {
      const owner = await register(main(), "ingest-repeat");
      const { ingestKey } = await createProperty(main(), owner);
      const body = batchText({ events: [nowEvent(), nowEvent({ name: "page_view" })] });
      const answers = await Promise.all([
        ingest(main(), body, { key: ingestKey }),
        ingest(main(), body, { key: ingestKey }),
      ]);
      expect(answers.map((answer) => [answer.status, answer.text])).toEqual([
        [202, ""],
        [202, ""],
      ]);
      expect(await eventsOf(main(), owner)).toHaveLength(2);
    });

    it("skips events not allowed and outside the time window, still answering 202", async () => {
      const owner = await register(main(), "ingest-skip");
      const { ingestKey } = await createProperty(main(), owner);
      const answer = await ingest(
        main(),
        batchText({
          events: [
            nowEvent({ name: "unlisted" }),
            nowEvent({ at: Date.now() - 26 * 3_600_000 }),
            nowEvent({ at: Date.now() + 600_000 }),
          ],
        }),
        { key: ingestKey },
      );
      expect(answer.status).toBe(202);
      expect(await eventsOf(main(), owner)).toEqual([]);
    });

    it("refuses each thing wrong with its own status, storing nothing", async () => {
      const owner = await register(main(), "ingest-refusals");
      const property = await createProperty(main(), owner);
      const key = property.ingestKey;
      const statusOf = async (...args: Parameters<typeof ingest>) => (await ingest(...args)).status;

      expect(await statusOf(main(), batchText({ extra: 1 }), { key })).toBe(400);
      expect(
        await statusOf(main(), batchText({ events: [nowEvent(), nowEvent({ id: "x" })] }), { key }),
      ).toBe(400);
      expect(await statusOf(main(), batchText(), { key, origin: "https://evil.example" })).toBe(
        403,
      );
      expect(await statusOf(main(), batchText(), { key, origin: null })).toBe(403);
      expect(await statusOf(main(), " ".repeat(65_537), { key, type: "text/plain" })).toBe(413);
      expect(
        await statusOf(main(), "a=1", { key, type: "application/x-www-form-urlencoded" }),
      ).toBe(415);
      expect(await statusOf(main(), batchText())).toBe(404);

      const unknown = await ingest(main(), batchText(), { key: `pk_${"z".repeat(40)}` });
      const disabled = await api(main(), "PUT", `/api/properties/${property.documentId}`, {
        jwt: owner.jwt,
        body: { data: { active: false } },
      });
      expect(disabled.status, disabled.text).toBe(200);
      const inactive = await ingest(main(), batchText(), { key });
      expect([unknown.status, unknown.text]).toEqual([404, inactive.text]);
      expect(inactive.status).toBe(404);
      expect(await eventsOf(main(), owner)).toEqual([]);
    });

    it("keeps a key to its own property, and lets it read nothing", async () => {
      const alice = await register(main(), "ingest-alice");
      const bob = await register(main(), "ingest-bob");
      const aliceProperty = await createProperty(main(), alice);
      await createProperty(main(), bob);
      expect((await ingest(main(), batchText(), { key: aliceProperty.ingestKey })).status).toBe(
        202,
      );
      expect(await eventsOf(main(), alice)).toHaveLength(1);
      expect(await eventsOf(main(), bob)).toEqual([]);
      for (const path of [
        "/api/events",
        "/api/properties",
        `/api/properties/${aliceProperty.documentId}`,
      ]) {
        const answer = await api(main(), "GET", path, {
          headers: { "X-Idg-Write-Key": aliceProperty.ingestKey },
        });
        expect([401, 403, 404], `${path}: ${answer.text}`).toContain(answer.status);
        expect(answer.text).not.toContain(aliceProperty.ingestKey);
      }
    });

    it("limits a key, then an address, with 429 and Retry-After", async () => {
      const server = backend.servers.ingestLimited;
      const owner = await register(server, "ingest-limited");
      const { ingestKey } = await createProperty(server, owner);
      const keyRate = server.ingestKeyRatePerMinute;
      for (let request = 0; request < keyRate; request += 1) {
        expect((await ingest(server, batchText(), { key: ingestKey })).status).toBe(202);
      }
      const byKey = await ingest(server, batchText(), { key: ingestKey });
      expect(byKey.status).toBe(429);
      expect(Number(byKey.retryAfter)).toBeGreaterThanOrEqual(1);
      // Unknown keys are not counted per key, only per address, until the address is limited.
      const unknown = `pk_${"z".repeat(40)}`;
      for (let request = keyRate + 1; request < server.ingestThrottlePerMinute; request += 1) {
        expect((await ingest(server, batchText(), { key: unknown })).status).toBe(404);
      }
      const byAddress = await ingest(server, batchText(), { key: unknown });
      expect(byAddress.status).toBe(429);
      expect(Number(byAddress.retryAfter)).toBeGreaterThanOrEqual(1);
      expect(await eventsOf(server, owner)).toHaveLength(keyRate);
    });

    it("keeps no address, user agent, visitor id or key in an event, the cache or the log", () => {
      for (const server of [main(), backend.servers.ingestLimited]) {
        const database = new DatabaseSync(server.database, { readOnly: true });
        try {
          // The ingestion endpoint's counters: camis' guard per address, the handler's per key.
          // (camis' sign-in throttles key their own counters by the plain address; not this path.)
          const counters = database
            .prepare(
              "SELECT * FROM cache WHERE key LIKE '%camis-endpoint|IngestEvent|%' OR key LIKE '%ingest-key|%'",
            )
            .all();
          expect(counters.length).toBeGreaterThan(0);
          const rows = JSON.stringify([database.prepare("SELECT * FROM events").all(), counters]);
          expect(rows).toContain("dedupe_key");
          for (const secret of ["127.0.0.1", USER_AGENT, VISITOR, "pk_"]) {
            expect(rows).not.toContain(secret);
          }
        } finally {
          database.close();
        }
      }
      const log = readLog();
      for (const secret of [USER_AGENT, VISITOR]) expect(log).not.toContain(secret);
      expect(log.slice(logBefore)).not.toContain("127.0.0.1");
    });
  },
);
