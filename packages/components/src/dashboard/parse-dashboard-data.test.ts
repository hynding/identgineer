import { describe, expect, it } from "vitest";
import {
  DASHBOARD_LIMITS,
  parseEventPage,
  parseStatSummary,
  parseTrackedEvents,
  parseTrackedProperties,
} from "./parse-dashboard-data";

// The records are parsed through the lists, which are what the package exports.
const parseTrackedEvent = (value: unknown) => parseTrackedEvents([value])[0];
const parseTrackedProperty = (value: unknown) => parseTrackedProperties([value])[0];

const METRIC = { value: 12, previous: 10, series: [1, 2, 3] };
const SUMMARY = {
  propertyId: "p1",
  range: "7d",
  visitors: METRIC,
  pageViews: METRIC,
  events: METRIC,
};

describe("parseTrackedProperty", () => {
  it("keeps an id and a name, and an origin that is an http or https origin", () => {
    expect(
      parseTrackedProperty({ id: "p1", name: "Docs", origin: "https://docs.example.com/a?b#c" }),
    ).toEqual({ id: "p1", name: "Docs", origin: "https://docs.example.com" });
    expect(parseTrackedProperty({ id: "p1", name: "Docs" })).toEqual({ id: "p1", name: "Docs" });
  });

  it("drops an origin that is not an http or https address, and keeps the record", () => {
    for (const origin of ["javascript:alert(1)", "not a url", "", 7, null, "data:text/html,x"]) {
      expect(parseTrackedProperty({ id: "p1", name: "Docs", origin })).toEqual({
        id: "p1",
        name: "Docs",
      });
    }
  });

  it.each([
    ["not an object", "p1"],
    ["null", null],
    ["an array", ["p1", "Docs"]],
    ["no id", { name: "Docs" }],
    ["an id that is not text", { id: 7, name: "Docs" }],
    ["an empty id", { id: "", name: "Docs" }],
    ["an id that is only white space", { id: "  ", name: "Docs" }],
    ["no name", { id: "p1" }],
    ["an empty name", { id: "p1", name: "" }],
    ["a name that is not text", { id: "p1", name: { toString: (): string => "x" } }],
    ["an id that is too long", { id: "x".repeat(DASHBOARD_LIMITS.idLength + 1), name: "Docs" }],
    ["a name that is too long", { id: "p1", name: "x".repeat(DASHBOARD_LIMITS.textLength + 1) }],
  ])("refuses %s", (_label, value) => {
    expect(parseTrackedProperty(value)).toBeUndefined();
  });

  it("copies the fields it knows, so extra fields and getters on the input go nowhere", () => {
    const parsed = parseTrackedProperty({
      id: "p1",
      name: "Docs",
      secret: "x",
      __proto__: { a: 1 },
    });
    expect(Object.keys(parsed ?? {})).toEqual(["id", "name"]);
  });
});

describe("parseTrackedProperties", () => {
  it("is empty for anything that is not an array", () => {
    for (const value of [undefined, null, "p1", 7, {}, { length: 1, 0: { id: "a", name: "b" } }]) {
      expect(parseTrackedProperties(value)).toEqual([]);
    }
  });

  it("drops the records that are malformed and keeps the order of the rest", () => {
    expect(
      parseTrackedProperties([{ id: "b", name: "B" }, 3, { id: "a" }, { id: "c", name: "C" }]),
    ).toEqual([
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ]);
  });

  it("keeps the first of two records with one id, since an id picks one property", () => {
    expect(
      parseTrackedProperties([
        { id: "a", name: "First" },
        { id: "a", name: "Second" },
      ]),
    ).toEqual([{ id: "a", name: "First" }]);
  });

  it("keeps no more than the limit", () => {
    const many = Array.from({ length: DASHBOARD_LIMITS.properties + 50 }, (_, index) => ({
      id: `p${String(index)}`,
      name: "x",
    }));
    expect(parseTrackedProperties(many)).toHaveLength(DASHBOARD_LIMITS.properties);
  });
});

describe("parseTrackedEvent", () => {
  it("keeps the fields and writes the time as an ISO string in UTC", () => {
    expect(
      parseTrackedEvent({
        id: "e1",
        name: "signup_completed",
        occurredAt: "2026-03-01T12:30:00+02:00",
        path: "/pricing",
        properties: { plan: "pro", seats: 3, trial: false, coupon: null },
      }),
    ).toEqual({
      id: "e1",
      name: "signup_completed",
      occurredAt: "2026-03-01T10:30:00.000Z",
      path: "/pricing",
      properties: { plan: "pro", seats: 3, trial: false, coupon: null },
    });
  });

  it("takes a time in milliseconds", () => {
    expect(
      parseTrackedEvent({ id: "e1", name: "x", occurredAt: Date.UTC(2026, 2, 1, 12, 0, 0) })
        ?.occurredAt,
    ).toBe("2026-03-01T12:00:00.000Z");
  });

  it.each([
    ["a word", "yesterday"],
    ["a date with no time", "2026-03-01"],
    ["a time with no zone", "2026-03-01T12:30:00"],
    ["a month that is not one", "2026-13-01T00:00:00Z"],
    ["a day the month does not have", "2026-02-30T00:00:00Z"],
    ["the 29th of February in a year that has none", "2027-02-29T00:00:00Z"],
    ["hour 24", "2026-03-01T24:00:00Z"],
    ["minute 60", "2026-03-01T12:60:00Z"],
    ["second 60", "2026-03-01T12:00:60Z"],
    ["day 00", "2026-03-00T12:00:00Z"],
    ["an offset of 24 hours", "2026-03-01T12:00:00+24:00"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a time past what a date holds", 8.64e15 + 1],
    ["an object", {}],
    ["nothing", undefined],
  ])("refuses a time that is %s", (_label, occurredAt) => {
    expect(parseTrackedEvent({ id: "e1", name: "x", occurredAt })).toBeUndefined();
  });

  it.each([
    ["no id", { name: "x", occurredAt: 0 }],
    ["no name", { id: "e", occurredAt: 0 }],
    ["an empty name", { id: "e", name: "", occurredAt: 0 }],
    ["an id that is a number", { id: 1, name: "x", occurredAt: 0 }],
    ["not an object", "e"],
  ])("refuses %s", (_label, value) => {
    expect(parseTrackedEvent(value)).toBeUndefined();
  });

  it("drops a path that is not text, and keeps the record", () => {
    expect(parseTrackedEvent({ id: "e", name: "x", occurredAt: 0, path: 4 })).toEqual({
      id: "e",
      name: "x",
      occurredAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("keeps only properties whose value is text, a finite number, a boolean or null", () => {
    const parsed = parseTrackedEvent({
      id: "e",
      name: "x",
      occurredAt: 0,
      properties: {
        ok: "yes",
        nested: { a: 1 },
        list: [1],
        nan: Number.NaN,
        inf: Number.POSITIVE_INFINITY,
        fn: () => 1,
        undef: undefined,
        big: 10n,
        sym: Symbol("s"),
      },
    });
    expect(parsed?.properties).toEqual({ ok: "yes" });
  });

  it("keeps a property called __proto__ as data and never as the prototype", () => {
    const properties = JSON.parse('{"__proto__": "x", "constructor": "y"}') as unknown;
    const parsed = parseTrackedEvent({ id: "e", name: "x", occurredAt: 0, properties });
    expect(Object.getPrototypeOf(parsed?.properties)).toBe(Object.prototype);
    expect(Object.keys(parsed?.properties ?? {}).sort()).toEqual(["__proto__", "constructor"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("drops properties that are not an object, and keeps no more than the limit", () => {
    expect(
      parseTrackedEvent({ id: "e", name: "x", occurredAt: 0, properties: ["a"] })?.properties,
    ).toBeUndefined();
    const many = Object.fromEntries(
      Array.from({ length: DASHBOARD_LIMITS.properties + 5 }, (_, index) => [
        `k${String(index)}`,
        "v",
      ]),
    );
    expect(
      Object.keys(
        parseTrackedEvent({ id: "e", name: "x", occurredAt: 0, properties: many })?.properties ??
          {},
      ),
    ).toHaveLength(DASHBOARD_LIMITS.eventProperties);
  });
});

describe("parseTrackedEvents", () => {
  it("is empty for anything that is not an array", () => {
    expect(parseTrackedEvents("events")).toEqual([]);
    expect(parseTrackedEvents(undefined)).toEqual([]);
  });

  it("drops what is malformed and what repeats an id", () => {
    const good = { id: "a", name: "x", occurredAt: 0 };
    expect(
      parseTrackedEvents([good, { id: "b" }, { ...good, name: "again" }, null]).map(
        (event) => event.id,
      ),
    ).toEqual(["a"]);
  });

  it("keeps no more than the limit", () => {
    const many = Array.from({ length: DASHBOARD_LIMITS.events + 10 }, (_, index) => ({
      id: `e${String(index)}`,
      name: "x",
      occurredAt: 0,
    }));
    expect(parseTrackedEvents(many)).toHaveLength(DASHBOARD_LIMITS.events);
  });
});

describe("parseEventPage", () => {
  const event = { id: "a", name: "x", occurredAt: 0 };

  it("keeps the events and the total, and the page that was asked for", () => {
    expect(parseEventPage({ events: [event], total: 41 })?.total).toBe(41);
    expect(parseEventPage({ events: [event], total: 41 })?.events).toHaveLength(1);
  });

  it("takes the length of the events for a total that is missing, negative, fractional or not a number", () => {
    for (const total of [undefined, -1, 1.5, Number.NaN, "7", null]) {
      expect(parseEventPage({ events: [event], total })?.total).toBe(1);
    }
  });

  it("never gives a total below the events it holds", () => {
    expect(parseEventPage({ events: [event, { ...event, id: "b" }], total: 1 })?.total).toBe(2);
  });

  it("is undefined for a response that is not an object with events", () => {
    for (const value of [undefined, null, [], "x", { events: "x" }, { total: 3 }]) {
      expect(parseEventPage(value)).toBeUndefined();
    }
  });
});

describe("parseStatSummary", () => {
  it("keeps a summary with its three figures", () => {
    expect(parseStatSummary(SUMMARY)).toEqual(SUMMARY);
  });

  it("leaves out a previous figure that is not a finite number", () => {
    expect(
      parseStatSummary({ ...SUMMARY, visitors: { value: 1, previous: Number.NaN, series: [] } })
        ?.visitors,
    ).toEqual({ value: 1, series: [] });
  });

  it("drops the entries of a series that are not finite numbers, and keeps no more than the limit", () => {
    expect(
      parseStatSummary({
        ...SUMMARY,
        events: { value: 1, series: [1, "2", Number.NaN, null, 3, Number.POSITIVE_INFINITY] },
      })?.events.series,
    ).toEqual([1, 3]);
    const long = Array.from({ length: DASHBOARD_LIMITS.series + 5 }, (_, index) => index);
    expect(
      parseStatSummary({ ...SUMMARY, events: { value: 1, series: long } })?.events.series,
    ).toHaveLength(DASHBOARD_LIMITS.series);
  });

  it.each([
    ["not an object", 7],
    ["no property id", { ...SUMMARY, propertyId: undefined }],
    ["a range it does not know", { ...SUMMARY, range: "1y" }],
    ["a figure that is NaN", { ...SUMMARY, visitors: { value: Number.NaN, series: [] } }],
    ["a figure that is text", { ...SUMMARY, pageViews: { value: "12", series: [] } }],
    ["a missing metric", { ...SUMMARY, events: undefined }],
    ["a series that is not a list", { ...SUMMARY, events: { value: 1, series: "1,2" } }],
  ])("is undefined for %s", (_label, value) => {
    expect(parseStatSummary(value)).toBeUndefined();
  });
});

describe("parseEventPage: the total", () => {
  it("keeps a total up to the limit and clamps one beyond it", () => {
    const events = [{ id: "e", name: "x", occurredAt: 0 }];
    expect(parseEventPage({ events, total: 5_000 })?.total).toBe(5_000);
    expect(parseEventPage({ events, total: 1e300 })?.total).toBe(DASHBOARD_LIMITS.total);
    expect(parseEventPage({ events, total: Number.MAX_SAFE_INTEGER })?.total).toBe(
      DASHBOARD_LIMITS.total,
    );
  });
});

describe("the limits are reached by stopping, not by cutting afterwards", () => {
  it("reads no more events than it keeps", () => {
    let read = 0;
    const events = Array.from({ length: 5_000 }, (_, index) => ({
      get id() {
        read += 1;
        return `e${String(index)}`;
      },
      name: "x",
      occurredAt: 0,
    }));
    expect(parseTrackedEvents(events)).toHaveLength(DASHBOARD_LIMITS.events);
    expect(read).toBeLessThanOrEqual(DASHBOARD_LIMITS.events);
  });

  it("reads no more property values than it keeps", () => {
    let read = 0;
    const properties: Record<string, string> = {};
    for (let index = 0; index < 5_000; index += 1) {
      Object.defineProperty(properties, `k${String(index)}`, {
        enumerable: true,
        get() {
          read += 1;
          return "v";
        },
      });
    }
    const parsed = parseTrackedEvents([{ id: "e", name: "x", occurredAt: 0, properties }]);
    expect(Object.keys(parsed[0]?.properties ?? {})).toHaveLength(DASHBOARD_LIMITS.eventProperties);
    expect(read).toBeLessThanOrEqual(DASHBOARD_LIMITS.eventProperties);
  });
});
