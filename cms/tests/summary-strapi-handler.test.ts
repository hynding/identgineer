import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import controller, {
  type SummaryContext,
} from "../protected/src/api/property/controllers/property-summary.ts";
import { rowsOf, type SummaryStrapiLike } from "../protected/src/summary/strapi-summary-ports.ts";
import { strapiEventDatabase, type StoredEvent } from "./strapi-event-database.ts";
import { loadSummaryVectors } from "./summary-vectors.ts";

// The Strapi handler through its controller: the ownership lookup against a stand-in for Strapi's
// document service, the counts on sqlite as Strapi stores events there, on a fixed clock.

const NOW = "2026-03-10T14:25:00.000Z";
const ME = 7;
const SOMEONE_ELSE = 8;
const MINE = "ownedbyme000000000000001";
const THEIRS = "ownedbythem0000000000002";
const MISSING = "nosuchproperty0000000003";

interface PropertyRow {
  readonly id: number;
  readonly documentId: string;
  readonly ownerId: number;
}

const PROPERTIES: PropertyRow[] = [
  { id: 11, documentId: MINE, ownerId: ME },
  { id: 12, documentId: THEIRS, ownerId: SOMEONE_ELSE },
];

const EVENTS: StoredEvent[] = [
  {
    propertyRowId: 11,
    name: "page_view",
    occurredAt: "2026-03-10T14:00:00.000Z",
    sessionId: "session-one-000001",
  },
  {
    propertyRowId: 11,
    name: "signup",
    occurredAt: "2026-03-09T14:59:59.999Z",
    sessionId: "session-one-000001",
  },
  {
    propertyRowId: 12,
    name: "page_view",
    occurredAt: "2026-03-10T14:00:00.000Z",
    sessionId: "session-two-000002",
  },
];

const META = {
  tableName: "events",
  attributes: {
    occurredAt: { columnName: "occurred_at" },
    name: { columnName: "name" },
    sessionId: { columnName: "session_id" },
    property: {
      joinTable: {
        name: "events_property_lnk",
        joinColumn: { name: "event_id" },
        inverseJoinColumn: { name: "property_id" },
      },
    },
  },
};

interface Filters {
  readonly documentId: { $eq: unknown };
  readonly owner: { id: { $eq: unknown } };
}

const fakeStrapi = (events: readonly StoredEvent[] = EVENTS, client = "sqlite") => {
  const database = strapiEventDatabase(events);
  const lookups: Record<string, unknown>[] = [];
  const logged: string[] = [];
  const failures = { lookup: false, count: false };
  const strapi: SummaryStrapiLike & { log: { error(message: string): void } } = {
    documents(uid) {
      expect(uid).toBe("api::property.property");
      return {
        findFirst(params) {
          lookups.push(params);
          if (failures.lookup) {
            return Promise.reject(
              new Error(`SQLITE_ERROR: select from properties where document_id = '${MINE}'`),
            );
          }
          const filters = params.filters as Filters;
          const row = PROPERTIES.find(
            (property) =>
              property.documentId === filters.documentId.$eq &&
              property.ownerId === filters.owner.id.$eq,
          );
          return Promise.resolve(
            row === undefined ? null : { id: row.id, documentId: row.documentId },
          );
        },
      };
    },
    db: {
      dialect: { client },
      metadata: {
        get(uid) {
          expect(uid).toBe("api::event.event");
          return META;
        },
      },
      connection: {
        raw(sql, bindings) {
          if (failures.count) {
            return Promise.reject(
              new TypeError(`SQLITE_ERROR near ${String(bindings[0])}: ${sql}`),
            );
          }
          return database.connection.raw(sql, bindings);
        },
      },
    },
    log: { error: (message) => logged.push(message) },
  };
  return { strapi, lookups, logged, failures, statements: database.statements };
};

const request = async (
  strapi: SummaryStrapiLike & { log: { error(message: string): void } },
  options: { id?: unknown; range?: unknown; user?: { id?: unknown } | null },
) => {
  const headers: Record<string, string> = {};
  const context: SummaryContext = {
    params: { id: options.id },
    query: "range" in options ? { range: options.range } : {},
    state: { user: "user" in options ? options.user : { id: ME } },
    status: 404,
    body: undefined,
    set: (field, value) => {
      headers[field] = value;
    },
  };
  await controller({ strapi }).handle(context);
  return { status: context.status, body: context.body, headers };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/properties/:id/summary on Strapi", () => {
  it("answers the owner's figures over the range and the range before, uncached", async () => {
    const { strapi } = fakeStrapi();
    const answer = await request(strapi, { id: MINE, range: "24h" });
    expect(answer.status).toBe(200);
    expect(answer.headers["Cache-Control"]).toBe("no-store");
    const zeros = (last: number) => [...new Array<number>(23).fill(0), last];
    expect(answer.body).toEqual({
      data: {
        propertyId: MINE,
        range: "24h",
        visitors: { value: 1, previous: 1, series: zeros(1) },
        pageViews: { value: 1, previous: 0, series: zeros(1) },
        events: { value: 1, previous: 1, series: zeros(1) },
      },
    });
  });

  it("looks the property up by its document id and the caller in one query", async () => {
    const { strapi, lookups, statements } = fakeStrapi();
    await request(strapi, { id: MINE, range: "7d" });
    expect(lookups).toEqual([
      {
        filters: { documentId: { $eq: MINE }, owner: { id: { $eq: ME } } },
        fields: ["id"],
      },
    ]);
    expect(statements).toHaveLength(2);
    for (const statement of statements) expect(statement.bindings).toContain(11);
  });

  it("answers another user's property exactly as a missing one, after the same one lookup", async () => {
    const theirs = fakeStrapi();
    const missing = fakeStrapi();
    const forTheirs = await request(theirs.strapi, { id: THEIRS, range: "24h" });
    const forMissing = await request(missing.strapi, { id: MISSING, range: "24h" });
    expect(forTheirs).toEqual(forMissing);
    expect(forTheirs.status).toBe(404);
    expect(forTheirs.headers["Cache-Control"]).toBe("no-store");
    expect(forTheirs.body).toEqual({
      data: null,
      error: { status: 404, name: "NotFoundError", message: "Not Found", details: {} },
    });
    expect(theirs.lookups).toHaveLength(1);
    expect(missing.lookups).toHaveLength(1);
    expect(theirs.statements).toEqual([]);
    expect(missing.statements).toEqual([]);
  });

  it("answers the owner of the other property its own figures, never the first user's", async () => {
    const { strapi } = fakeStrapi();
    const answer = await request(strapi, { id: THEIRS, range: "24h", user: { id: SOMEONE_ELSE } });
    expect(answer.status).toBe(200);
    expect((answer.body as { data: { events: { value: number } } }).data.events.value).toBe(1);
  });

  it.each([
    ["no range", {}],
    ["an unknown range", { range: "1h" }],
    ["a range in capitals", { range: "24H" }],
    ["a range sent twice", { range: ["7d", "7d"] }],
    ["a range as an object", { range: { $eq: "7d" } }],
  ])("refuses %s with 400, before any lookup", async (_label, query) => {
    const { strapi, lookups } = fakeStrapi();
    const answer = await request(strapi, { id: MINE, ...query });
    expect(answer.status).toBe(400);
    expect(answer.body).toMatchObject({ error: { status: 400, name: "ValidationError" } });
    expect(lookups).toEqual([]);
  });

  it.each(["", "a/b", "x".repeat(129), "../../properties"])(
    "answers a malformed id %j as a missing property, without a lookup",
    async (id) => {
      const { strapi, lookups } = fakeStrapi();
      const answer = await request(strapi, { id, range: "7d" });
      expect(answer.status).toBe(404);
      expect(lookups).toEqual([]);
    },
  );

  it.each([
    ["no user (an API token)", null],
    ["a user without a numeric id", { id: "7" }],
  ])("refuses a caller with %s with 403", async (_label, user) => {
    const { strapi, lookups } = fakeStrapi();
    const answer = await request(strapi, { id: MINE, range: "7d", user });
    expect(answer.status).toBe(403);
    expect(lookups).toEqual([]);
  });

  it("answers 503 when the lookup fails, logging the error's class and nothing it says", async () => {
    const { strapi, failures, logged } = fakeStrapi();
    failures.lookup = true;
    const answer = await request(strapi, { id: MINE, range: "7d" });
    expect(answer.status).toBe(503);
    expect(logged).toEqual([
      "PropertySummary: the database failed at the lookup (Error); answered 503",
    ]);
  });

  it("answers 503 when a count fails, logging the error's class and nothing it says", async () => {
    const { strapi, failures, logged } = fakeStrapi();
    failures.count = true;
    const answer = await request(strapi, { id: MINE, range: "30d" });
    expect(answer.status).toBe(503);
    expect(logged.join("\n")).toBe(
      "PropertySummary: the database failed at the count (TypeError); answered 503",
    );
  });

  it("answers an empty property with zeros", async () => {
    const { strapi } = fakeStrapi([]);
    const answer = await request(strapi, { id: MINE, range: "7d" });
    expect(answer.body).toMatchObject({
      data: { events: { value: 0, previous: 0, series: [0, 0, 0, 0, 0, 0, 0] } },
    });
  });

  it("answers the shared vectors through the whole controller", async () => {
    for (const vector of loadSummaryVectors()) {
      vi.setSystemTime(new Date(vector.now));
      const { strapi } = fakeStrapi(
        vector.events.map((event) => ({
          propertyRowId: event.other === true ? 12 : 11,
          name: event.name,
          occurredAt: event.occurredAt,
          sessionId: event.sessionId,
        })),
      );
      const answer = await request(strapi, { id: MINE, range: vector.range });
      expect(answer.body, vector.name).toEqual({
        data: { propertyId: MINE, range: vector.range, ...vector.expected },
      });
    }
  });
});

describe("the counts Strapi's mysql client is sent", () => {
  it("compare session ids by their bytes, so sessions differing only by case are two visitors", async () => {
    const { strapi } = fakeStrapi(EVENTS, "mysql");
    const sent: string[] = [];
    // MySQL is not here to run them: record the SQL and answer as mysql2 does for no rows.
    const raw = (sql: string) => {
      sent.push(sql);
      return Promise.resolve([[], []]);
    };
    const answer = await request(
      { ...strapi, db: { ...strapi.db, connection: { raw } } },
      { id: MINE, range: "7d" },
    );
    expect(answer.status).toBe(200);
    expect(sent).toHaveLength(2);
    for (const sql of sent) expect(sql).toContain("CAST(e.session_id AS BINARY)");
    expect(sent.join(" ")).not.toMatch(/DISTINCT (bucketed\.|CASE WHEN [^)]* THEN )e\.session_id/);
  });
});

describe("knex's raw answers", () => {
  const rows = [{ bucket: 0, events: 1 }];

  it("are read as sqlite, MySQL and pg give them", () => {
    expect(rowsOf(rows)).toEqual(rows);
    expect(rowsOf([rows, [{ name: "bucket" }]])).toEqual(rows);
    expect(rowsOf({ rows, rowCount: 1 })).toEqual(rows);
    expect(rowsOf([])).toEqual([]);
    expect(rowsOf([[], []])).toEqual([]);
  });

  it("are refused when they hold no rows at all", () => {
    expect(() => rowsOf(undefined)).toThrow(/no rows/);
    expect(() => rowsOf({ count: 3 })).toThrow(/no rows/);
  });
});
