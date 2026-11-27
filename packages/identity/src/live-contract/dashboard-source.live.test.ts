import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CmsDashboardError,
  createCmsDashboardSource,
  type CmsDashboardSource,
} from "../../../tracking/src/dashboard.ts";
import { createTracker, type Tracker } from "../../../tracking/src/index.ts";
import { createFakePage, createMemoryStorage } from "../../../tracking/src/testing/index.ts";
import { createBrowserFetch } from "./browser-fetch.ts";
import { createCookieJar } from "./cookie-jar.ts";
import {
  createBrowser,
  disposeTabs,
  freshAccount,
  liveBackend,
  openTab,
  post,
  SKIP_NOTE,
  type LiveBackend,
  type LiveServer,
} from "./live-backend.ts";

// The CMS dashboard source of @identgineer/tracking/dashboard against strapi-php, sending with the
// identity SDK's authorizedFetch as the dashboard page will, over events the real tracker sent.
// Two users: each sees only their own properties, events and figures, and nothing of the other's
// through the source or through the content API's filters, populate and sort. It lives here to
// share this harness; the tracking package does not depend on the identity package.

const backend = liveBackend ?? ({} as LiveBackend);
const SITE = "https://shop.example";

interface User {
  readonly id: number;
  readonly jwt: string;
  readonly source: CmsDashboardSource;
}

interface Property {
  readonly documentId: string;
  readonly ingestKey: string;
}

const main = (): LiveServer => backend.servers.main;

/** A user signed in through the identity SDK, with a source sending through its authorizedFetch. */
const signedInUser = async (label: string): Promise<User> => {
  const account = freshAccount(label);
  const answer = await post(main(), "/api/auth/local/register", account);
  expect(answer.status).toBe(200);
  const { jwt, user } = answer.body as { jwt: string; user: { id: number } };
  const tab = openTab(main(), createBrowser(backend));
  await tab.signIn({ identifier: account.email, password: account.password });
  const source = createCmsDashboardSource({ baseUrl: main().url, fetch: tab.authorizedFetch });
  return { id: user.id, jwt, source };
};

/** A raw request with a user's token or as a guest, outside the source. */
const raw = async (
  path: string,
  options: { readonly jwt?: string; readonly method?: string; readonly body?: unknown } = {},
): Promise<{ status: number; body: unknown; text: string; cacheControl: string | null }> => {
  const response = await fetch(`${main().url}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.jwt === undefined ? {} : { Authorization: `Bearer ${options.jwt}` }),
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
  return {
    status: response.status,
    body,
    text,
    cacheControl: response.headers.get("Cache-Control"),
  };
};

const createProperty = async (owner: User, name: string, domain: string): Promise<Property> => {
  const answer = await raw("/api/properties", {
    jwt: owner.jwt,
    method: "POST",
    body: {
      data: {
        name,
        domain,
        allowedOrigins: [{ origin: SITE }],
        allowedEvents: [{ name: "signup_completed", propertyKeys: [{ key: "plan" }] }],
      },
    },
  });
  expect(answer.status, answer.text).toBeLessThan(300);
  return (answer.body as { data: Property }).data;
};

const trackers: Tracker[] = [];

/** The real tracker on a page of SITE, sending with a browser's fetch, consent granted. */
const visit = async (writeKey: string, path: string, send: (tracker: Tracker) => void) => {
  const browser = createBrowserFetch({ jar: createCookieJar(), pageOrigin: SITE });
  const tracker = createTracker({
    endpoint: `${main().url}/api/ingest/events`,
    writeKey,
    events: { signup_completed: { properties: { plan: "string" } } },
    fetch: browser.fetch,
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    crossTab: null,
    page: createFakePage({ href: `${SITE}${path}` }),
  });
  trackers.push(tracker);
  tracker.consent.grant();
  send(tracker);
  await tracker.flush();
  expect(browser.sent.map((request) => request.status)).toContain(202);
};

const rejection = async (promise: Promise<unknown>): Promise<CmsDashboardError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CmsDashboardError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
};

const sum = (series: readonly number[]): number => series.reduce((total, item) => total + item, 0);

const MISSING = "nosuchproperty0000000003";
const PAGE = { page: 1, pageSize: 25 } as const;

afterEach(() => {
  for (const tracker of trackers.splice(0)) tracker.dispose();
});

// The users' tabs serve every test, as one dashboard page's session does.
afterAll(disposeTabs);

describe.skipIf(liveBackend === undefined)(
  `the CMS dashboard source against strapi-php ${liveBackend === undefined ? SKIP_NOTE : ""}`,
  () => {
    let alice: User;
    let bob: User;
    let aliceShop: Property;
    let aliceQuiet: Property;
    let bobShop: Property;

    beforeAll(async () => {
      alice = await signedInUser("dashboard-alice");
      bob = await signedInUser("dashboard-bob");
      aliceShop = await createProperty(alice, "Alice's shop", "shop.alice.example");
      aliceQuiet = await createProperty(alice, "Alice's quiet site", "quiet.alice.example");
      bobShop = await createProperty(bob, "Bob's shop", "shop.bob.example");
      await visit(aliceShop.ingestKey, "/pricing", (tracker) => {
        tracker.page();
        tracker.track("signup_completed", { plan: "pro" });
      });
      await visit(bobShop.ingestKey, "/bob-only", (tracker) => {
        tracker.page();
      });
    });

    it("lists each user's own properties, with their names and origins, and no key", async () => {
      const mine = await alice.source.listProperties();
      expect(mine).toEqual([
        { id: aliceShop.documentId, name: "Alice's shop", origin: "https://shop.alice.example" },
        {
          id: aliceQuiet.documentId,
          name: "Alice's quiet site",
          origin: "https://quiet.alice.example",
        },
      ]);
      expect(JSON.stringify(mine)).not.toContain("pk_");
      expect(await bob.source.listProperties()).toEqual([
        { id: bobShop.documentId, name: "Bob's shop", origin: "https://shop.bob.example" },
      ]);
    });

    it("lists the events the real tracker sent to the owner's property, newest first", async () => {
      const page = await alice.source.listEvents(aliceShop.documentId, PAGE);
      expect(page.total).toBe(2);
      expect(page.events.map((event) => [event.name, event.path, event.properties])).toEqual([
        ["signup_completed", "/pricing", { plan: "pro" }],
        ["page_view", "/pricing", undefined],
      ]);
      const byName = await alice.source.listEvents(aliceShop.documentId, {
        ...PAGE,
        sort: { key: "name", direction: "ascending" },
      });
      expect(byName.events.map((event) => event.name)).toEqual(["page_view", "signup_completed"]);
      const second = await alice.source.listEvents(aliceShop.documentId, { page: 2, pageSize: 1 });
      expect(second).toEqual({ events: [page.events[1]], total: 2 });
    });

    it("answers the owner's property without events with an empty page", async () => {
      expect(await alice.source.listEvents(aliceQuiet.documentId, PAGE)).toEqual({
        events: [],
        total: 0,
      });
    });

    it("refuses another user's property exactly as a missing one, for events and figures", async () => {
      for (const call of [
        (id: string) => alice.source.listEvents(id, PAGE),
        (id: string) => alice.source.summary(id, "7d"),
      ]) {
        const theirs = await rejection(call(bobShop.documentId));
        const missing = await rejection(call(MISSING));
        expect(theirs.code).toBe("not-found");
        expect([theirs.code, theirs.message]).toEqual([missing.code, missing.message]);
      }
    });

    it("sums the tracker's events in the owner's figures, over each range", async () => {
      const day = await alice.source.summary(aliceShop.documentId, "24h");
      expect(day.events.value).toBe(2);
      expect(day.pageViews.value).toBe(1);
      expect(day.visitors.value).toBe(1);
      expect(day.events.previous).toBe(0);
      expect(day.events.series).toHaveLength(24);
      expect(day.events.series.at(-1)).toBe(2);
      for (const range of ["7d", "30d"] as const) {
        const summary = await alice.source.summary(aliceShop.documentId, range);
        expect(summary.events.series).toHaveLength(range === "7d" ? 7 : 30);
        expect(sum(summary.events.series)).toBe(2);
        expect(summary.visitors.value).toBe(1);
      }
      const quiet = await alice.source.summary(aliceQuiet.documentId, "7d");
      expect([quiet.events.value, quiet.visitors.value, sum(quiet.pageViews.series)]).toEqual([
        0, 0, 0,
      ]);
      const bobs = await bob.source.summary(bobShop.documentId, "24h");
      expect([bobs.events.value, bobs.pageViews.value, bobs.visitors.value]).toEqual([1, 1, 1]);
    });

    it("answers the summary uncached, and 404 with one body for another's property and a missing one", async () => {
      const own = await raw(`/api/properties/${aliceShop.documentId}/summary?range=7d`, {
        jwt: alice.jwt,
      });
      expect(own.status).toBe(200);
      expect(own.cacheControl).toContain("no-store");
      const theirs = await raw(`/api/properties/${bobShop.documentId}/summary?range=7d`, {
        jwt: alice.jwt,
      });
      const missing = await raw(`/api/properties/${MISSING}/summary?range=7d`, { jwt: alice.jwt });
      expect([theirs.status, theirs.text]).toEqual([404, missing.text]);
      expect(theirs.cacheControl).toContain("no-store");
      const badRange = await raw(`/api/properties/${aliceShop.documentId}/summary?range=1y`, {
        jwt: alice.jwt,
      });
      expect(badRange.status).toBe(400);
    });

    it("refuses the summary to a caller without a session, and the source to a signed-out page", async () => {
      const anonymous = await raw(`/api/properties/${aliceShop.documentId}/summary?range=7d`);
      expect(anonymous.status).toBe(403);
      // camis refuses it before the handler; the protected SummaryNoStore keeps it uncached too.
      expect(anonymous.cacheControl).toContain("no-store");
      expect((await raw("/api/events")).status).toBe(403);
      expect((await raw("/api/properties")).status).toBe(403);
      // A page whose identity client has no session: authorizedFetch sends nothing.
      const signedOut = createCmsDashboardSource({
        baseUrl: main().url,
        fetch: openTab(main(), createBrowser(backend)).authorizedFetch,
      });
      expect((await rejection(signedOut.listProperties())).code).toBe("unauthenticated");
      // A token the CMS does not know: 401.
      const stale = createCmsDashboardSource({
        baseUrl: main().url,
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            headers: {
              ...(init.headers as Record<string, string>),
              Authorization: "Bearer 1|nope",
            },
          }),
      });
      expect((await rejection(stale.summary(aliceShop.documentId, "7d"))).code).toBe(
        "unauthenticated",
      );
    });

    it("never shows one user's events to the other through filters, populate or sort", async () => {
      const probes = [
        `/api/events?filters[property][documentId][$eq]=${bobShop.documentId}`,
        `/api/events?filters[$or][0][property][documentId][$eq]=${bobShop.documentId}&filters[$or][1][name][$eq]=page_view`,
        "/api/events?populate=property&pagination[pageSize]=25",
        "/api/events?populate[property][populate]=*&sort=occurredAt:desc",
        "/api/events?sort[0]=name:asc&filters[path][$eq]=/bob-only",
      ];
      for (const probe of probes) {
        const answer = await raw(probe, { jwt: alice.jwt });
        expect(answer.status, probe).toBe(200);
        expect(answer.text, probe).not.toContain("/bob-only");
        expect(answer.text, probe).not.toContain(bobShop.documentId);
        expect(answer.text, probe).not.toContain(bobShop.ingestKey);
      }
      // Fields that would tell users apart, or match a guessed event id, are refused outright.
      for (const probe of [
        `/api/events?filters[owner][id][$eq]=${String(bob.id)}`,
        "/api/events?sort=dedupeKey:asc",
        "/api/events?filters[dedupeKey][$null]=false",
        "/api/events?fields[0]=dedupeKey",
      ]) {
        expect((await raw(probe, { jwt: alice.jwt })).status, probe).toBe(400);
      }
      expect((await raw(`/api/events?populate=owner`, { jwt: alice.jwt })).text).not.toContain(
        "@example.test",
      );
      const own = await raw("/api/events?pagination[pageSize]=25", { jwt: alice.jwt });
      expect(own.text).not.toContain("dedupeKey");
      expect((own.body as { data: unknown[] }).data).toHaveLength(2);
    });
  },
);
