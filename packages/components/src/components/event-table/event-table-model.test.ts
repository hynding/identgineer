import { describe, expect, it } from "vitest";
import type { TrackedEvent } from "../../dashboard/dashboard-types";
import { MARK } from "../../utils/untrusted-text";
import {
  EVENT_TABLE_LIMITS,
  displayedProperties,
  normalisePage,
  normalisePageSize,
  pageCountOf,
  sortEvents,
} from "./event-table-model";

const event = (id: string, name: string, occurredAt: string): TrackedEvent => ({
  id,
  name,
  occurredAt,
});

const EVENTS = [
  event("a", "signup", "2026-03-02T10:00:00.000Z"),
  event("b", "Checkout", "2026-03-01T10:00:00.000Z"),
  event("c", "alpha", "2026-03-03T10:00:00.000Z"),
  event("d", "signup", "2026-03-01T10:00:00.000Z"),
];

const ids = (events: readonly TrackedEvent[]) => events.map((item) => item.id).join("");

describe("normalisePageSize", () => {
  it("is the number given, as a whole number between 1 and the limit", () => {
    expect(normalisePageSize(25)).toBe(25);
    expect(normalisePageSize(7.9)).toBe(7);
    expect(normalisePageSize(0)).toBe(EVENT_TABLE_LIMITS.defaultPageSize);
    expect(normalisePageSize(-5)).toBe(EVENT_TABLE_LIMITS.defaultPageSize);
    expect(normalisePageSize(10_000)).toBe(EVENT_TABLE_LIMITS.pageSize);
  });

  it("is the default for anything that is not a finite number", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "20", undefined, null, {}]) {
      expect(normalisePageSize(value)).toBe(EVENT_TABLE_LIMITS.defaultPageSize);
    }
  });
});

describe("pageCountOf and normalisePage", () => {
  it("counts the pages, at least one", () => {
    expect(pageCountOf(0, 10)).toBe(1);
    expect(pageCountOf(10, 10)).toBe(1);
    expect(pageCountOf(11, 10)).toBe(2);
    expect(pageCountOf(Number.NaN, 10)).toBe(1);
  });

  it("holds the page to the pages there are", () => {
    expect(normalisePage(2, 5)).toBe(2);
    expect(normalisePage(9, 5)).toBe(5);
    expect(normalisePage(0, 5)).toBe(1);
    expect(normalisePage(-3, 5)).toBe(1);
    expect(normalisePage(2.9, 5)).toBe(2);
    expect(normalisePage(Number.NaN, 5)).toBe(1);
    expect(normalisePage("3", 5)).toBe(1);
  });
});

describe("sortEvents", () => {
  it("keeps the order it was given when there is no key", () => {
    expect(ids(sortEvents(EVENTS, "", "ascending", "en"))).toBe("abcd");
  });

  it("sorts by time, and keeps the order of events at one time", () => {
    expect(ids(sortEvents(EVENTS, "time", "ascending", "en"))).toBe("bdac");
    expect(ids(sortEvents(EVENTS, "time", "descending", "en"))).toBe("cadb");
  });

  it("sorts by name the way the language does, without regard to case, and keeps the order of equal names", () => {
    expect(ids(sortEvents(EVENTS, "name", "ascending", "en"))).toBe("cbad");
    expect(ids(sortEvents(EVENTS, "name", "descending", "en"))).toBe("adbc");
  });

  it("sorts numbers inside names by their value", () => {
    const named = ["step 10", "step 9", "step 2"].map((name, index) =>
      event(String(index), name, "2026-03-01T00:00:00.000Z"),
    );
    expect(sortEvents(named, "name", "ascending", "en").map((item) => item.name)).toEqual([
      "step 2",
      "step 9",
      "step 10",
    ]);
  });

  it("does not change the list it was given", () => {
    const copy = [...EVENTS];
    sortEvents(EVENTS, "name", "ascending", "en");
    expect(EVENTS).toEqual(copy);
  });

  it("copes with a language tag the browser refuses", () => {
    expect(ids(sortEvents(EVENTS, "name", "ascending", "not a tag!"))).toBe("cbad");
  });
});

describe("displayedProperties", () => {
  it("lists the keys and values as text, in the order they came", () => {
    expect(displayedProperties({ plan: "pro", seats: 3, trial: false, coupon: null })).toEqual({
      entries: [
        { key: "plan", value: "pro" },
        { key: "seats", value: "3" },
        { key: "trial", value: "false" },
        { key: "coupon", value: "null" },
      ],
      hidden: 0,
    });
  });

  it("is empty for no properties", () => {
    expect(displayedProperties(undefined)).toEqual({ entries: [], hidden: 0 });
    expect(displayedProperties({})).toEqual({ entries: [], hidden: 0 });
  });

  it("shows no more than the limit and counts the rest", () => {
    const many = Object.fromEntries(
      Array.from({ length: EVENT_TABLE_LIMITS.properties + 7 }, (_, index) => [
        `k${String(index)}`,
        "v",
      ]),
    );
    const shown = displayedProperties(many);
    expect(shown.entries).toHaveLength(EVENT_TABLE_LIMITS.properties);
    expect(shown.hidden).toBe(7);
  });

  it("cuts a long key and a long value, and neutralises both", () => {
    const shown = displayedProperties({
      ["k".repeat(500)]: "v".repeat(5000),
      "a‮b": "x\ny",
    });
    expect(shown.entries[0]?.key.length).toBeLessThanOrEqual(EVENT_TABLE_LIMITS.propertyKey);
    expect(shown.entries[0]?.value.length).toBeLessThanOrEqual(EVENT_TABLE_LIMITS.propertyValue);
    expect(shown.entries[1]).toEqual({ key: `a${MARK}b`, value: "x y" });
  });
});
