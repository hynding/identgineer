import { describe, expect, it } from "vitest";
import {
  CmsDashboardError,
  createCmsDashboardSource,
  MAX_DASHBOARD_PAGE_SIZE,
  MAX_DASHBOARD_PROPERTIES,
  type CmsDashboardFetch,
  type CmsDashboardSource,
} from "./dashboard.ts";

// The CMS dashboard source against a fake of the CMS's REST answers (both targets answer alike):
// what it asks for, what it accepts, and how every refusal maps to a dashboard error code.

const BASE = "https://cms.example.com/backend";
const MINE = "ownedbyme000000000000001";
const THEIRS = "ownedbythem0000000000002";

interface PropertyRow {
  readonly documentId: string;
  readonly name: string;
  readonly domain: string;
}

interface EventRow {
  readonly documentId: string;
  readonly name: string;
  readonly occurredAt: string;
  readonly path?: string | null;
  readonly properties?: unknown;
}

interface Sent {
  readonly url: URL;
  readonly init: RequestInit;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });

const notFound = () =>
  json({ data: null, error: { status: 404, name: "NotFoundError", message: "Not Found" } }, 404);

const property = (index: number): PropertyRow => ({
  documentId: `property${String(index).padStart(16, "0")}`,
  name: `Site ${String(index)}`,
  domain: `site${String(index)}.example.com`,
});

const event = (index: number, fields: Partial<EventRow> = {}): EventRow => ({
  documentId: `event${String(index).padStart(19, "0")}`,
  name: "page_view",
  occurredAt: new Date(Date.UTC(2026, 2, 10, 12, index)).toISOString(),
  path: "/pricing",
  properties: null,
  ...fields,
});

const pageOf = <T>(rows: readonly T[], url: URL) => {
  const page = Number(url.searchParams.get("pagination[page]"));
  const pageSize = Number(url.searchParams.get("pagination[pageSize]"));
  return {
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      pagination: {
        page,
        pageSize,
        pageCount: Math.ceil(rows.length / pageSize),
        total: rows.length,
      },
    },
  };
};

const METRIC = (length: number) => ({
  value: 3,
  previous: 2,
  series: Array.from({ length }, (_, index) => (index === length - 1 ? 3 : 0)),
});

const summaryOf = (propertyId: string, range: string) => {
  const length = range === "24h" ? 24 : range === "7d" ? 7 : 30;
  return {
    data: {
      propertyId,
      range,
      visitors: METRIC(length),
      pageViews: METRIC(length),
      events: METRIC(length),
    },
  };
};

/** The CMS as the signed-in owner of `properties` sees it, with an override per path. */
function fakeCms(
  options: {
    properties?: readonly PropertyRow[];
    events?: readonly EventRow[];
    answer?: (url: URL) => Response | undefined;
  } = {},
) {
  const properties = options.properties ?? [
    { documentId: MINE, name: "Shop", domain: "shop.example.com" },
  ];
  const events = options.events ?? [];
  const sent: Sent[] = [];
  const fetch: CmsDashboardFetch = (input, init) => {
    const url = new URL(input);
    sent.push({ url, init });
    const override = options.answer?.(url);
    if (override !== undefined) return Promise.resolve(override);
    const path = url.pathname.replace("/backend", "");
    if (path === "/api/properties") return Promise.resolve(json(pageOf(properties, url)));
    const owned = (id: string | undefined) => properties.some((p) => p.documentId === id);
    const summary = /^\/api\/properties\/([^/]+)\/summary$/.exec(path);
    if (summary) {
      return Promise.resolve(
        owned(summary[1])
          ? json(summaryOf(summary[1] ?? "", url.searchParams.get("range") ?? ""))
          : notFound(),
      );
    }
    const one = /^\/api\/properties\/([^/]+)$/.exec(path);
    if (one) {
      return Promise.resolve(
        owned(one[1])
          ? json({ data: { id: 1, documentId: one[1], name: "Shop" }, meta: {} })
          : notFound(),
      );
    }
    if (path === "/api/events") {
      const id = url.searchParams.get("filters[property][documentId][$eq]") ?? "";
      return Promise.resolve(json(pageOf(owned(id) ? events : [], url)));
    }
    return Promise.resolve(notFound());
  };
  return { fetch, sent, source: createCmsDashboardSource({ baseUrl: BASE, fetch }) };
}

const rejection = async (promise: Promise<unknown>): Promise<CmsDashboardError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CmsDashboardError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
};

const QUERY = { page: 1, pageSize: 10 } as const;

describe("createCmsDashboardSource", () => {
  it.each([
    ["no base URL", { baseUrl: undefined }],
    ["plain http off localhost", { baseUrl: "http://cms.example.com" }],
    ["a base URL with a query", { baseUrl: "https://cms.example.com/?x=1" }],
    ["a base URL with credentials", { baseUrl: "https://user:pass@cms.example.com" }],
    ["no fetch", { fetch: undefined }],
  ])("refuses %s", (_label, options) => {
    expect(() =>
      createCmsDashboardSource({
        baseUrl: BASE,
        fetch: () => Promise.reject(new Error("unused")),
        ...options,
      } as never),
    ).toThrow(TypeError);
  });

  it("takes http on localhost, for development", () => {
    expect(() =>
      createCmsDashboardSource({
        baseUrl: "http://127.0.0.1:1337",
        fetch: () => Promise.reject(new Error("x")),
      }),
    ).not.toThrow();
  });

  it("sends GETs under the base URL with no credentials of its own, uncached, never following a redirect", async () => {
    const { source, sent } = fakeCms();
    await source.listProperties();
    await source.summary(MINE, "7d");
    for (const { url, init } of sent) {
      expect(url.href.startsWith(`${BASE}/api/`)).toBe(true);
      expect(init).toEqual({
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
    }
  });
});

describe("listProperties", () => {
  it("answers the caller's properties as id, name and origin, and never the ingest key", async () => {
    const { source, sent } = fakeCms({
      answer: (url) =>
        url.pathname.endsWith("/api/properties")
          ? json({
              data: [
                {
                  id: 4,
                  documentId: MINE,
                  name: "Shop",
                  domain: "shop.example.com",
                  ingestKey: `pk_${"a".repeat(40)}`,
                },
              ],
              meta: { pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 } },
            })
          : undefined,
    });
    expect(await source.listProperties()).toEqual([
      { id: MINE, name: "Shop", origin: "https://shop.example.com" },
    ]);
    const query = sent[0]?.url.searchParams;
    expect(query?.getAll("fields[0]")).toEqual(["name"]);
    expect(query?.getAll("fields[1]")).toEqual(["domain"]);
    expect([...(query?.keys() ?? [])].filter((key) => key.startsWith("fields"))).toHaveLength(2);
    expect(query?.get("sort[0]")).toBe("id:asc");
    expect(query?.get("pagination[pageSize]")).toBe(String(MAX_DASHBOARD_PAGE_SIZE));
  });

  it("follows every page", async () => {
    const properties = Array.from({ length: 60 }, (_, index) => property(index));
    const { source, sent } = fakeCms({ properties });
    const listed = await source.listProperties();
    expect(listed.map((p) => p.id)).toEqual(properties.map((p) => p.documentId));
    expect(sent.map(({ url }) => url.searchParams.get("pagination[page]"))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it(`stops at ${String(MAX_DASHBOARD_PROPERTIES)} properties, the first ones by id`, async () => {
    const properties = Array.from({ length: 260 }, (_, index) => property(index));
    const { source, sent } = fakeCms({ properties });
    const listed = await source.listProperties();
    expect(listed).toHaveLength(MAX_DASHBOARD_PROPERTIES);
    expect(listed.at(-1)?.id).toBe(properties[MAX_DASHBOARD_PROPERTIES - 1]?.documentId);
    expect(sent).toHaveLength(MAX_DASHBOARD_PROPERTIES / MAX_DASHBOARD_PAGE_SIZE);
  });

  it("answers no properties with an empty list after one request", async () => {
    const { source, sent } = fakeCms({ properties: [] });
    expect(await source.listProperties()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("keeps a property once when a page boundary shifts under it", async () => {
    const first = property(1);
    const { source } = fakeCms({
      answer: (url) => {
        if (!url.pathname.endsWith("/api/properties")) return undefined;
        const page = Number(url.searchParams.get("pagination[page]"));
        const rows = page === 1 ? Array.from({ length: 25 }, (_, i) => property(i + 1)) : [first];
        return json({
          data: rows,
          meta: { pagination: { page, pageSize: 25, pageCount: 2, total: 26 } },
        });
      },
    });
    expect(await source.listProperties()).toHaveLength(25);
  });

  const MAX_PAGES = Math.ceil(MAX_DASHBOARD_PROPERTIES / MAX_DASHBOARD_PAGE_SIZE);
  const endless = (rowsOf: (page: number) => readonly PropertyRow[]) =>
    fakeCms({
      answer: (url) => {
        if (!url.pathname.endsWith("/api/properties")) return undefined;
        const page = Number(url.searchParams.get("pagination[page]"));
        if (page > 1_000) throw new Error("the client did not stop");
        return json({
          data: rowsOf(page),
          meta: { pagination: { page, pageSize: 25, pageCount: 1_000_000, total: 25_000_000 } },
        });
      },
    });

  it("stops at the first page that adds no property, when the server claims endless empty pages", async () => {
    const { source, sent } = endless((page) =>
      page === 1 ? Array.from({ length: 25 }, (_, i) => property(i)) : [],
    );
    expect(await source.listProperties()).toHaveLength(25);
    expect(sent).toHaveLength(2);
  });

  it("stops at the first page that adds no property, when the server sends the same rows again", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => property(i));
    const { source, sent } = endless(() => rows);
    expect(await source.listProperties()).toHaveLength(25);
    expect(sent).toHaveLength(2);
  });

  it(`asks for at most ${String(MAX_PAGES)} pages, however few properties each one adds`, async () => {
    const { source, sent } = endless((page) => [property(page)]);
    expect(await source.listProperties()).toHaveLength(MAX_PAGES);
    expect(sent).toHaveLength(MAX_PAGES);
  });

  it.each([401])("rejects %s as unauthenticated", async (status) => {
    const { source } = fakeCms({ answer: () => json({}, status) });
    expect((await rejection(source.listProperties())).code).toBe("unauthenticated");
  });

  it.each([403, 404, 429, 500, 503, 400, 204])(
    "rejects %s as unavailable: a list of the caller's own has no id to hide",
    async (status) => {
      const { source } = fakeCms({
        answer: () => new Response(status === 204 ? null : "{}", { status }),
      });
      expect((await rejection(source.listProperties())).code).toBe("unavailable");
    },
  );
});

describe("listEvents", () => {
  const events = Array.from({ length: 30 }, (_, index) => event(index));

  it("asks for one page of the property's events, newest first, with the id breaking ties", async () => {
    const { source, sent } = fakeCms({ events });
    const page = await source.listEvents(MINE, { page: 2, pageSize: 10 });
    expect(page.total).toBe(30);
    expect(page.events.map((e) => e.id)).toEqual(events.slice(10, 20).map((e) => e.documentId));
    const query = sent[0]?.url.searchParams;
    expect(sent[0]?.url.pathname).toBe("/backend/api/events");
    expect(query?.get("filters[property][documentId][$eq]")).toBe(MINE);
    expect(["0", "1", "2", "3"].map((i) => query?.get(`fields[${i}]`))).toEqual([
      "name",
      "occurredAt",
      "path",
      "properties",
    ]);
    expect([query?.get("sort[0]"), query?.get("sort[1]")]).toEqual(["occurredAt:desc", "id:desc"]);
    expect([query?.get("pagination[page]"), query?.get("pagination[pageSize]")]).toEqual([
      "2",
      "10",
    ]);
    expect(sent).toHaveLength(1);
  });

  it.each([
    [{ key: "time", direction: "ascending" }, ["occurredAt:asc", "id:asc"]],
    [{ key: "time", direction: "descending" }, ["occurredAt:desc", "id:desc"]],
    [{ key: "name", direction: "ascending" }, ["name:asc", "id:asc"]],
    [{ key: "name", direction: "descending" }, ["name:desc", "id:desc"]],
  ] as const)("sorts by %j", async (sort, expected) => {
    const { source, sent } = fakeCms({ events });
    await source.listEvents(MINE, { ...QUERY, sort });
    const query = sent[0]?.url.searchParams;
    expect([query?.get("sort[0]"), query?.get("sort[1]")]).toEqual(expected);
  });

  it("answers each event as the dashboard shows it, path and properties only when stored", async () => {
    const { source } = fakeCms({
      events: [
        event(1, {
          name: "signup",
          properties: { plan: "pro", seats: 3, trial: false, note: null },
        }),
        event(2, { path: null }),
      ],
    });
    const page = await source.listEvents(MINE, QUERY);
    expect(page.events).toEqual([
      {
        id: event(1).documentId,
        name: "signup",
        occurredAt: event(1).occurredAt,
        path: "/pricing",
        properties: { plan: "pro", seats: 3, trial: false, note: null },
      },
      { id: event(2).documentId, name: "page_view", occurredAt: event(2).occurredAt },
    ]);
  });

  it("answers the caller's property without events with an empty page, once the property says it is theirs", async () => {
    const { source, sent } = fakeCms({ events: [] });
    expect(await source.listEvents(MINE, QUERY)).toEqual({ events: [], total: 0 });
    expect(sent.map(({ url }) => url.pathname)).toEqual([
      "/backend/api/events",
      `/backend/api/properties/${MINE}`,
    ]);
  });

  it("rejects a property that is not the caller's as not-found, never as an empty page", async () => {
    const { source } = fakeCms({ events });
    const theirs = await rejection(source.listEvents(THEIRS, QUERY));
    const missing = await rejection(source.listEvents("nosuchproperty0000000003", QUERY));
    expect(theirs.code).toBe("not-found");
    expect(theirs.message).toBe(missing.message);
    expect(theirs.message).not.toContain(THEIRS);
  });

  it("does not ask about the property again for a page past the last one", async () => {
    const { source, sent } = fakeCms({ events });
    expect(await source.listEvents(MINE, { page: 9, pageSize: 10 })).toEqual({
      events: [],
      total: 30,
    });
    expect(sent).toHaveLength(1);
  });

  it.each([403, 404])("rejects %s from the CMS as not-found", async (status) => {
    const { source } = fakeCms({ answer: () => json({}, status) });
    expect((await rejection(source.listEvents(MINE, QUERY))).code).toBe("not-found");
  });

  it.each([
    ["no query", MINE, undefined],
    ["a null query", MINE, null],
    ["page 0", MINE, { page: 0, pageSize: 10 }],
    ["a fractional page", MINE, { page: 1.5, pageSize: 10 }],
    ["a page that is not a number", MINE, { page: "1", pageSize: 10 }],
    ["a page size of 0", MINE, { page: 1, pageSize: 0 }],
    [`a page size above ${String(MAX_DASHBOARD_PAGE_SIZE)}`, MINE, { page: 1, pageSize: 26 }],
    ["an unknown sort key", MINE, { ...QUERY, sort: { key: "path", direction: "ascending" } }],
    ["an unknown direction", MINE, { ...QUERY, sort: { key: "time", direction: "up" } }],
    ["a null sort", MINE, { ...QUERY, sort: null }],
    ["an empty property id", "", QUERY],
    ["a property id with a slash", "a/b", QUERY],
    ["a property id that is not text", 7, QUERY],
  ])("refuses %s as invalid-request without sending anything", async (_label, id, query) => {
    const { source, sent } = fakeCms({ events });
    const error = await rejection(source.listEvents(id as string, query as never));
    expect(error.code).toBe("invalid-request");
    expect(sent).toEqual([]);
  });
});

describe("summary", () => {
  it("answers the summary of the property over the range in one request", async () => {
    const { source, sent } = fakeCms();
    const summary = await source.summary(MINE, "24h");
    expect(summary).toEqual(summaryOf(MINE, "24h").data);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url.pathname).toBe(`/backend/api/properties/${MINE}/summary`);
    expect(sent[0]?.url.search).toBe("?range=24h");
  });

  it("rejects a property that is not the caller's as not-found", async () => {
    const { source } = fakeCms();
    expect((await rejection(source.summary(THEIRS, "7d"))).code).toBe("not-found");
  });

  it.each([
    ["another property", () => summaryOf(THEIRS, "7d")],
    ["another range", () => summaryOf(MINE, "30d")],
    [
      "a series of the wrong length",
      () => ({ data: { ...summaryOf(MINE, "7d").data, events: METRIC(8) } }),
    ],
    [
      "a negative figure",
      () => ({ data: { ...summaryOf(MINE, "7d").data, visitors: { ...METRIC(7), value: -1 } } }),
    ],
    [
      "a figure that is not whole",
      () => ({
        data: { ...summaryOf(MINE, "7d").data, visitors: { ...METRIC(7), previous: 1.5 } },
      }),
    ],
    [
      "no previous figure",
      () => ({
        data: { ...summaryOf(MINE, "7d").data, pageViews: { value: 1, series: METRIC(7).series } },
      }),
    ],
    [
      "a missing figure",
      () => ({ data: { propertyId: MINE, range: "7d", visitors: METRIC(7), events: METRIC(7) } }),
    ],
    [
      "events that are not the sum of their buckets",
      () => ({ data: { ...summaryOf(MINE, "7d").data, events: { ...METRIC(7), value: 4 } } }),
    ],
    [
      "page views that are not the sum of their buckets",
      () => ({ data: { ...summaryOf(MINE, "7d").data, pageViews: { ...METRIC(7), value: 2 } } }),
    ],
    ["no data", () => ({ data: null })],
    ["something beside the data", () => ({ ...summaryOf(MINE, "7d"), error: {} })],
  ])("rejects an answer with %s as invalid-response", async (_label, body) => {
    const { source } = fakeCms({ answer: () => json(body()) });
    expect((await rejection(source.summary(MINE, "7d"))).code).toBe("invalid-response");
  });

  it("takes visitors below the sum of their buckets: one visitor seen in two buckets counts once", async () => {
    const visitors = { value: 1, previous: 0, series: [0, 0, 0, 0, 0, 1, 1] };
    const body = { data: { ...summaryOf(MINE, "7d").data, visitors } };
    const { source } = fakeCms({ answer: () => json(body) });
    expect((await source.summary(MINE, "7d")).visitors).toEqual(visitors);
  });

  it.each([["1h"], [""], [undefined], ["24H"]])(
    "refuses the range %j without sending anything",
    async (range) => {
      const { source, sent } = fakeCms();
      expect((await rejection(source.summary(MINE, range as never))).code).toBe("invalid-request");
      expect(sent).toEqual([]);
    },
  );
});

describe("every call's refusals", () => {
  const calls: [string, (source: CmsDashboardSource) => Promise<unknown>][] = [
    ["listProperties", (source) => source.listProperties()],
    ["listEvents", (source) => source.listEvents(MINE, QUERY)],
    ["summary", (source) => source.summary(MINE, "7d")],
  ];

  it.each(calls)("%s rejects a 401 as unauthenticated", async (_name, call) => {
    const { source } = fakeCms({ answer: () => json({ error: { status: 401 } }, 401) });
    expect((await rejection(call(source))).code).toBe("unauthenticated");
  });

  it.each(calls)(
    "%s rejects as unauthenticated when no one is signed in to send it",
    async (_name, call) => {
      const signedOut = Object.assign(new Error("signed out"), { code: "unauthorized" });
      const source = createCmsDashboardSource({
        baseUrl: BASE,
        fetch: () => Promise.reject(signedOut),
      });
      expect((await rejection(call(source))).code).toBe("unauthenticated");
    },
  );

  it.each(calls)(
    "%s rejects a network failure, 429 and 5xx as unavailable",
    async (_name, call) => {
      const offline = createCmsDashboardSource({
        baseUrl: BASE,
        fetch: () =>
          Promise.reject(new TypeError("Failed to fetch https://cms.example.com token=abc")),
      });
      const error = await rejection(call(offline));
      expect(error.code).toBe("unavailable");
      expect(error.message).not.toMatch(/abc|cms\.example/);
      for (const status of [429, 500, 502, 503]) {
        const { source } = fakeCms({ answer: () => json({}, status, { "Retry-After": "5" }) });
        expect((await rejection(call(source))).code, String(status)).toBe("unavailable");
      }
    },
  );

  it.each(calls)(
    "%s names itself in the error and is a DashboardError by name",
    async (name, call) => {
      const { source } = fakeCms({ answer: () => json({}, 401) });
      const error = await rejection(call(source));
      expect(error.name).toBe("DashboardError");
      expect(error.message.startsWith(`${name}: `)).toBe(true);
    },
  );

  const malformed: [string, () => Response][] = [
    [
      "a body that is not JSON",
      () => new Response("<html>", { headers: { "Content-Type": "text/html" } }),
    ],
    [
      "JSON that does not parse",
      () => new Response("{", { headers: { "Content-Type": "application/json" } }),
    ],
    [
      "JSON that is not UTF-8",
      () =>
        new Response(new Uint8Array([0x7b, 0xff, 0x7d]), {
          headers: { "Content-Type": "application/json" },
        }),
    ],
    [
      "a body declared too long",
      () =>
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(64 * 1024 * 1024),
          },
        }),
    ],
    [
      "a body too long as it is read",
      () =>
        new Response(`"${"a".repeat(9 * 1024 * 1024)}"`, {
          headers: { "Content-Type": "application/json" },
        }),
    ],
    [
      "no body at all",
      () => new Response(null, { status: 200, headers: { "Content-Type": "application/json" } }),
    ],
    ["an array", () => json([])],
  ];

  it.each(
    calls.flatMap(([name, call]) =>
      malformed.map(([label, answer]) => [name, label, call, answer] as const),
    ),
  )("%s rejects %s as invalid-response", async (_name, _label, call, answer) => {
    const { source } = fakeCms({ answer });
    expect((await rejection(call(source))).code).toBe("invalid-response");
  });

  it.each(calls)(
    "%s rejects a fetch that answers something that is not a response",
    async (_name, call) => {
      const source = createCmsDashboardSource({
        baseUrl: BASE,
        fetch: () => Promise.resolve({ status: "200" } as unknown as Response),
      });
      expect((await rejection(call(source))).code).toBe("invalid-response");
      const throwing = createCmsDashboardSource({
        baseUrl: BASE,
        fetch: () =>
          Promise.resolve({
            get status(): number {
              throw new Error("getter");
            },
          } as unknown as Response),
      });
      expect((await rejection(call(throwing))).code).toBe("invalid-response");
    },
  );
});

describe("a malformed list", () => {
  const listWith = (data: unknown, meta?: unknown) =>
    fakeCms({
      events: [event(1)],
      answer: (url) =>
        url.pathname.endsWith("/api/events") || url.pathname.endsWith("/api/properties")
          ? json({
              data,
              meta: meta ?? {
                pagination: {
                  page: 1,
                  pageSize: Number(url.searchParams.get("pagination[pageSize]")),
                  pageCount: 1,
                  total: Array.isArray(data) ? data.length : 0,
                },
              },
            })
          : undefined,
    }).source;

  it.each([
    ["a property without a document id", { name: "Shop", domain: "shop.example.com" }],
    ["a property with an empty name", { documentId: MINE, name: " ", domain: "shop.example.com" }],
    [
      "a property whose domain is a URL",
      { documentId: MINE, name: "Shop", domain: "https://shop.example.com" },
    ],
    [
      "a property with a document id that names a path",
      { documentId: "../x", name: "Shop", domain: "a.example.com" },
    ],
  ])("refuses %s", async (_label, row) => {
    expect((await rejection(listWith([row]).listProperties())).code).toBe("invalid-response");
  });

  it.each([
    ["an event name the wire format refuses", event(1, { name: "Page View" })],
    ["a time without milliseconds", event(1, { occurredAt: "2026-03-10T12:00:00Z" })],
    ["a time the calendar lacks", event(1, { occurredAt: "2026-02-30T12:00:00.000Z" })],
    ["a time in another zone", event(1, { occurredAt: "2026-03-10T12:00:00.000+01:00" })],
    ["a relative path", event(1, { path: "pricing" })],
    ["nested properties", event(1, { properties: { plan: { tier: "pro" } } })],
    ["properties as a list", event(1, { properties: ["pro"] })],
    ["a property key the wire format refuses", event(1, { properties: { "Plan Name": "pro" } })],
    ["a property value that is not finite", { ...event(1), properties: { seats: "x" }, name: 7 }],
  ])("refuses %s", async (_label, row) => {
    expect((await rejection(listWith([row]).listEvents(MINE, QUERY))).code).toBe(
      "invalid-response",
    );
  });

  it.each([
    ["another page", { pagination: { page: 2, pageSize: 10, pageCount: 1, total: 1 } }],
    ["another page size", { pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 } }],
    [
      "a page count the total does not give",
      { pagination: { page: 1, pageSize: 10, pageCount: 3, total: 1 } },
    ],
    [
      "more rows than the total leaves",
      { pagination: { page: 1, pageSize: 10, pageCount: 0, total: 0 } },
    ],
    [
      "a total that is not a number",
      { pagination: { page: 1, pageSize: 10, pageCount: 1, total: "1" } },
    ],
    ["no pagination", {}],
    [
      "something beside the pagination",
      { pagination: { page: 1, pageSize: 10, pageCount: 1, total: 1 }, extra: 1 },
    ],
  ])("refuses events with %s", async (_label, meta) => {
    expect((await rejection(listWith([event(1)], meta).listEvents(MINE, QUERY))).code).toBe(
      "invalid-response",
    );
  });

  it("refuses an answer whose data is not a list", async () => {
    expect((await rejection(listWith({ id: 1 }).listEvents(MINE, QUERY))).code).toBe(
      "invalid-response",
    );
  });
});
