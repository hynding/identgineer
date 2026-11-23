import { describe, expect, it, vi } from "vitest";
import { createEventQueue } from "./event-queue.ts";
import { writeStoredQueue } from "./queue-persistence.ts";
import { createMemoryStorage } from "./testing/memory-storage.ts";
import { MAX_TIMESTAMP } from "./wire-format.ts";
import {
  CONSENT_KEY,
  QUEUE_KEY,
  START,
  createWorld,
  grantedTab,
  openTab,
  returningTab,
  settle,
  type Tab,
} from "./test-harness.ts";

const DAY = 86_400_000;
const storedTargets = (tab: Tab): unknown[] =>
  (
    JSON.parse(tab.world.local.peek(QUEUE_KEY) ?? '{"events":[]}') as {
      events: { properties?: { target?: string } }[];
    }
  ).events.map((event) => event.properties?.target);
const track = (tab: Tab, target: string): void => {
  tab.world.clock.advance(1);
  tab.tracker.track("clicked", { target });
};

describe("a decision time at the largest timestamp", () => {
  it("still lets grant() be stored, and read back as granted", () => {
    const world = createWorld();
    world.local.seed(
      CONSENT_KEY,
      JSON.stringify({ state: "denied", version: 1, decidedAt: MAX_TIMESTAMP }),
    );
    const tab = openTab(world);
    expect(tab.tracker.consent.grant()).toBe(true);
    expect(tab.tracker.consent.get()).toEqual({ state: "granted" });
    expect(JSON.parse(world.local.peek(CONSENT_KEY) ?? "null")).toMatchObject({
      state: "granted",
      decidedAt: MAX_TIMESTAMP,
    });
  });
});

describe("a status listener that disposes the tracker", () => {
  it("stops the listeners after it from being called", () => {
    const tab = grantedTab(createWorld());
    const later: string[] = [];
    tab.tracker.consent.onChange(() => {
      tab.tracker.dispose();
    });
    tab.tracker.consent.onChange((status) => later.push(status.state));
    tab.page.setGpc(true);
    tab.tracker.consent.get();
    expect(later).toEqual([]);
  });
});

describe("a huge stored queue", () => {
  const event = (index: number) => ({
    id: `${String(index).padStart(8, "0")}${"A".repeat(14)}`,
    name: "clicked",
    at: START,
    properties: { target: "x" },
  });

  it("is refused by length before it is parsed", async () => {
    const world = createWorld();
    const text = JSON.stringify({
      v: 1,
      events: Array.from({ length: 40_000 }, (_v, i) => event(i)),
    });
    world.local.seed(QUEUE_KEY, text);
    const parse = JSON.parse;
    const lengths: number[] = [];
    JSON.parse = (...args: Parameters<typeof JSON.parse>) => {
      lengths.push(String(args[0]).length);
      return parse(...args) as unknown;
    };
    try {
      const tab = returningTab(world);
      await tab.tracker.flush();
      expect(Math.max(...lengths)).toBeLessThan(text.length / 10);
      expect(world.collector.requests).toEqual([]);
      expect(world.local.peek(QUEUE_KEY)).toBeNull();
    } finally {
      JSON.parse = parse;
    }
  });

  it("is cut to the event cap before any event is validated", async () => {
    const world = createWorld();
    const bad = { ...event(0), name: "Bad Name" };
    const events = [bad, ...Array.from({ length: 99 }, (_v, i) => event(i + 1))];
    world.local.seed(QUEUE_KEY, JSON.stringify({ v: 1, events }));
    const tab = returningTab(world, { maxQueueEvents: 5, maxBatchSize: 500 });
    await tab.tracker.flush();
    expect(world.collector.deliveredEvents()).toHaveLength(5);
  });

  it("is trimmed in one pass: the in-memory queue reads each size a few times at most", () => {
    const queue = createEventQueue({ maxEvents: 10, maxBytes: 1_000_000 });
    let reads = 0;
    const entries = Array.from({ length: 3000 }, (_v, index) => ({
      event: { id: String(index), name: "clicked", at: 1 },
      get bytes() {
        reads += 1;
        return 10;
      },
    }));
    queue.prepend(entries);
    expect(reads).toBeLessThan(entries.length * 5);
  });

  it("is trimmed in one pass: the stored merge reads each event a few times at most", () => {
    let reads = 0;
    const entries = Array.from({ length: 3000 }, (_v, index) => ({
      event: {
        id: `${String(index).padStart(8, "0")}${"A".repeat(14)}`,
        get name() {
          reads += 1;
          return "clicked";
        },
        at: index,
      },
      bytes: 10,
    }));
    writeStoredQueue(createMemoryStorage(), entries, new Set(), {
      maxEvents: 10,
      maxBytes: 1_000_000,
    });
    expect(reads).toBeLessThan(entries.length * 6);
  });
});

describe("a second createTracker call", () => {
  it("reports once, with its own code, that its consentVersion or events were ignored", () => {
    const world = createWorld();
    const session = createMemoryStorage();
    const first = openTab(world, { session });
    const same = openTab(world, { session });
    expect(same.drops).toEqual([]);
    const other = openTab(world, { session, consentVersion: 2 });
    expect(other.tracker).toBe(first.tracker);
    expect(other.drops.map((drop) => drop.code)).toEqual(["tracker-options-ignored"]);
    const events = openTab(world, { session, events: { other: { properties: {} } } });
    expect(events.drops.map((drop) => drop.code)).toEqual(["tracker-options-ignored"]);
    expect(first.drops).toEqual([]);
  });
});

describe("the hide path", () => {
  it("does not beacon an in-memory event older than 24 hours", async () => {
    const world = createWorld();
    const tab = grantedTab(world, { fetch: null });
    tab.tracker.track("clicked", { target: "stale" });
    world.clock.advance(DAY + 1000);
    tab.page.hide();
    await settle();
    expect(world.collector.requests).toEqual([]);
    expect(tab.drops.map((drop) => drop.code)).toContain("expired");
  });
});

describe("the stored-queue merge", () => {
  it("drops the oldest first across tabs, by date and not by the order written", () => {
    const world = createWorld();
    const a = grantedTab(world, { maxQueueEvents: 3, maxBatchSize: 500 });
    const b = openTab(world, { maxQueueEvents: 3, maxBatchSize: 500 });
    a.page.goOffline();
    b.page.goOffline();
    world.local.failWrites(true);
    track(b, "b1");
    world.local.failWrites(false);
    track(a, "a2");
    track(a, "a3");
    track(b, "b4");
    expect(storedTargets(a)).toEqual(["a2", "a3", "b4"]);
  });
});
