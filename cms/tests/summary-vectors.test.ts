import { describe, expect, it } from "vitest";
import { summaryFigures } from "../protected/src/summary/summary-figures.ts";
import { checkedTables, summaryQueries } from "../protected/src/summary/summary-sql.ts";
import {
  bucketEdges,
  isSummaryRange,
  summaryWindow,
} from "../protected/src/summary/summary-window.ts";
import { STRAPI_EVENT_TABLES, strapiEventDatabase } from "./strapi-event-database.ts";
import { loadSummaryVectors } from "./summary-vectors.ts";

// The Strapi handler's two grouped counts, run on sqlite as Strapi stores events there, against
// the vectors strapi-php's query is held to as well (summary-php-vectors.test.ts).

const PROPERTY = 3;
const OTHER_PROPERTY = 4;
const iso = (ms: number) => new Date(ms).toISOString();

describe("the summary's window", () => {
  it("ends where the UTC hour that holds now ends, and spans 24 hours, then 24 more before", () => {
    const window = summaryWindow(Date.parse("2026-03-10T14:25:00.000Z"), "24h");
    expect([iso(window.previousStart), iso(window.start), iso(window.end)]).toEqual([
      "2026-03-08T15:00:00.000Z",
      "2026-03-09T15:00:00.000Z",
      "2026-03-10T15:00:00.000Z",
    ]);
    expect(window.buckets).toBe(24);
    expect(bucketEdges(window).map(iso).slice(0, 2)).toEqual([
      "2026-03-09T16:00:00.000Z",
      "2026-03-09T17:00:00.000Z",
    ]);
    expect(bucketEdges(window)).toHaveLength(23);
  });

  it("ends where the UTC day that holds now ends for 7d and 30d", () => {
    const now = Date.parse("2026-04-01T23:59:59.999Z");
    expect(iso(summaryWindow(now, "7d").start)).toBe("2026-03-26T00:00:00.000Z");
    expect(iso(summaryWindow(now, "7d").end)).toBe("2026-04-02T00:00:00.000Z");
    expect(iso(summaryWindow(now, "30d").previousStart)).toBe("2026-02-01T00:00:00.000Z");
  });

  it("starts a new bucket at the very millisecond an hour begins", () => {
    const window = summaryWindow(Date.parse("2026-03-10T15:00:00.000Z"), "24h");
    expect(iso(window.end)).toBe("2026-03-10T16:00:00.000Z");
  });

  it("knows the three ranges and nothing else", () => {
    for (const range of ["24h", "7d", "30d"]) expect(isSummaryRange(range)).toBe(true);
    for (const other of ["1h", "24H", " 7d", "", undefined, ["7d"], 7]) {
      expect(isSummaryRange(other)).toBe(false);
    }
  });
});

describe("the Strapi handler's counts on the shared vectors", () => {
  const vectors = loadSummaryVectors();

  it("has vectors for every range", () => {
    expect(new Set(vectors.map((vector) => vector.range))).toEqual(new Set(["24h", "7d", "30d"]));
  });

  it.each(vectors.map((vector) => [vector.name, vector] as const))("%s", async (_name, vector) => {
    const database = strapiEventDatabase(
      vector.events.map((event) => ({
        propertyRowId: event.other === true ? OTHER_PROPERTY : PROPERTY,
        name: event.name,
        occurredAt: event.occurredAt,
        sessionId: event.sessionId,
      })),
    );
    const window = summaryWindow(Date.parse(vector.now), vector.range);
    const queries = summaryQueries(window, STRAPI_EVENT_TABLES, PROPERTY);
    const buckets = await database.connection.raw(queries.buckets.sql, queries.buckets.bindings);
    const [visitors] = await database.connection.raw(
      queries.visitors.sql,
      queries.visitors.bindings,
    );
    database.close();
    expect(
      summaryFigures(
        window,
        buckets as Record<string, unknown>[],
        visitors as Record<string, unknown>,
      ),
    ).toEqual(vector.expected);
  });
});

describe("the summary's queries", () => {
  const window = summaryWindow(Date.parse("2026-03-10T14:25:00.000Z"), "30d");

  it("bind every value, the property and the times, and write none into the SQL", () => {
    const { buckets, visitors } = summaryQueries(window, STRAPI_EVENT_TABLES, PROPERTY);
    for (const query of [buckets, visitors]) {
      expect(query.sql).not.toMatch(/'|2026|\bpage_view\b/);
      expect(query.sql.split("?").length - 1).toBe(query.bindings.length);
    }
    expect(buckets.bindings).toContain("page_view");
    expect(buckets.bindings).toContain(PROPERTY);
  });

  it("read at most twice the range", () => {
    const { buckets } = summaryQueries(window, STRAPI_EVENT_TABLES, PROPERTY);
    const times = buckets.bindings.filter((value) => value instanceof Date).map(Number);
    expect(Math.min(...times)).toBe(window.previousStart);
    expect(Math.max(...times)).toBe(window.end);
    expect(window.end - window.previousStart).toBe(60 * 86_400_000);
  });

  it("refuse a table or column name they would have to quote", () => {
    for (const name of ['events"; DROP TABLE events; --', "Events", "", "e.id"]) {
      expect(() => checkedTables({ ...STRAPI_EVENT_TABLES, table: name })).toThrow(
        /unexpected events column/,
      );
      expect(() =>
        checkedTables({
          ...STRAPI_EVENT_TABLES,
          link: { ...STRAPI_EVENT_TABLES.link, propertyColumn: name },
        }),
      ).toThrow(/unexpected events column/);
    }
  });
});

describe("the summary's figures", () => {
  const window = summaryWindow(Date.parse("2026-03-10T14:25:00.000Z"), "7d");

  it("read counts a driver sends as strings, and a sum over no row as zero", () => {
    expect(
      summaryFigures(
        window,
        [
          { bucket: "-1", events: "4", page_views: "3", visitors: "2" },
          { bucket: 6, events: "2", page_views: null, visitors: 1 },
        ],
        { current_visitors: "1", previous_visitors: "2" },
      ),
    ).toEqual({
      visitors: { value: 1, previous: 2, series: [0, 0, 0, 0, 0, 0, 1] },
      pageViews: { value: 0, previous: 3, series: [0, 0, 0, 0, 0, 0, 0] },
      events: { value: 2, previous: 4, series: [0, 0, 0, 0, 0, 0, 2] },
    });
  });

  it("refuse a bucket outside the range or a count that is not one", () => {
    expect(() =>
      summaryFigures(window, [{ bucket: 7, events: 1, page_views: 0, visitors: 0 }], undefined),
    ).toThrow(/outside the range/);
    expect(() =>
      summaryFigures(window, [{ bucket: 0, events: -1, page_views: 0, visitors: 0 }], undefined),
    ).toThrow(/not one/);
    expect(() =>
      summaryFigures(window, [{ bucket: 0, events: "x", page_views: 0, visitors: 0 }], undefined),
    ).toThrow(/not one/);
  });
});
