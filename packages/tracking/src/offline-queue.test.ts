import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "./testing/memory-storage.ts";
import {
  QUEUE_KEY,
  createWorld,
  grantedTab,
  openTab,
  returningTab,
  settle,
  type Tab,
} from "./test-harness.ts";

const HOUR = 3_600_000;

const GOOD = {
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  name: "clicked",
  at: 1_772_366_400_000,
  session: "BBBBBBBBBBBBBBBBBBBBBB",
};

const trackMany = (tab: Tab, count: number): void => {
  for (let index = 0; index < count; index += 1)
    tab.tracker.track("clicked", { target: `t${String(index)}` });
};

const stored = (tab: Tab): { v: number; events: { id: string; at: number }[] } =>
  JSON.parse(tab.world.local.peek(QUEUE_KEY) ?? "null") as {
    v: number;
    events: { id: string; at: number }[];
  };

describe("the offline queue", () => {
  it("is stored under one versioned key while events wait, and removed when they are delivered", async () => {
    const tab = grantedTab(createWorld());
    trackMany(tab, 2);
    expect(stored(tab).v).toBe(1);
    expect(stored(tab).events).toHaveLength(2);
    await tab.tracker.flush();
    expect(tab.world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it("is kept while a request is in flight and a retry is waiting", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer({ status: 500 });
    trackMany(tab, 2);
    await tab.tracker.flush();
    expect(stored(tab).events).toHaveLength(2);
  });

  it("is sent after a reload, with the same ids", async () => {
    const world = createWorld();
    const first = grantedTab(world);
    first.tracker.track("clicked", { target: "before-reload" });
    const [{ id }] = stored(first).events as unknown as [{ id: string }];
    first.tracker.dispose();
    const second = grantedTab(world);
    await second.tracker.flush();
    expect(world.collector.deliveredEvents().map((event) => event.id)).toEqual([id]);
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it("puts the stored events ahead of the new ones", async () => {
    const world = createWorld();
    const first = grantedTab(world);
    first.tracker.track("clicked", { target: "old" });
    first.tracker.dispose();
    const second = grantedTab(world);
    second.tracker.track("clicked", { target: "new" });
    await second.tracker.flush();
    expect(world.collector.deliveredEvents().map((event) => event.properties)).toEqual([
      { target: "old" },
      { target: "new" },
    ]);
  });

  it("is neither sent nor kept for a visitor who has not granted", async () => {
    const world = createWorld();
    world.local.seed(
      QUEUE_KEY,
      JSON.stringify({ v: 1, events: [{ ...GOOD, at: world.clock.now() }] }),
    );
    const tab = openTab(world);
    await tab.tracker.flush();
    world.clock.advance(HOUR);
    await settle();
    expect(world.collector.requests).toEqual([]);
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it("discards events older than 24 hours when it is loaded, and keeps one that is exactly that old", async () => {
    const world = createWorld();
    const now = world.clock.now();
    const stale = { ...GOOD, id: "SSSSSSSSSSSSSSSSSSSSSS", at: now - 24 * HOUR - 1 };
    const edge = { ...GOOD, id: "EEEEEEEEEEEEEEEEEEEEEE", at: now - 24 * HOUR };
    world.local.seed(QUEUE_KEY, JSON.stringify({ v: 1, events: [stale, edge] }));
    const tab = returningTab(world);
    await tab.tracker.flush();
    expect(world.collector.deliveredEvents().map((event) => event.id)).toEqual([edge.id]);
  });

  it("holds the cap on the number of events, dropping the oldest and reporting it", async () => {
    const tab = grantedTab(createWorld(), { maxQueueEvents: 5, maxBatchSize: 500, fetch: null });
    trackMany(tab, 8);
    expect(stored(tab).events).toHaveLength(5);
    expect(tab.drops.filter((drop) => drop.code === "queue-overflow").length).toBeGreaterThan(0);
    tab.tracker.dispose();
    const next = grantedTab(tab.world, { maxBatchSize: 500 });
    await next.tracker.flush();
    expect(tab.world.collector.deliveredEvents().map((event) => event.properties)).toEqual(
      [3, 4, 5, 6, 7].map((index) => ({ target: `t${String(index)}` })),
    );
  });

  it("holds the cap on bytes", () => {
    const tab = grantedTab(createWorld(), { maxQueueBytes: 2048, fetch: null, maxBatchSize: 500 });
    for (let index = 0; index < 30; index += 1)
      tab.tracker.track("clicked", { target: "x".repeat(100) });
    expect((tab.world.local.peek(QUEUE_KEY) ?? "").length).toBeLessThanOrEqual(2048 + 64);
    expect(stored(tab).events.length).toBeGreaterThan(0);
    expect(stored(tab).events.length).toBeLessThan(30);
  });

  describe("on load, anything malformed discards the whole stored queue", () => {
    const good = GOOD;
    it.each([
      ["not JSON", "{"],
      ["a string", '"x"'],
      ["an array", "[]"],
      ["another version", JSON.stringify({ v: 2, events: [good] })],
      ["no events list", JSON.stringify({ v: 1 })],
      ["an extra key", JSON.stringify({ v: 1, events: [good], extra: 1 })],
      ["an own __proto__", `{"v":1,"events":[],"__proto__":{"x":1}}`],
      [
        "an event with an own __proto__",
        `{"v":1,"events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"clicked","at":1,"session":"BBBBBBBBBBBBBBBBBBBBBB","__proto__":{"x":1}}]}`,
      ],
      [
        "an event with an unknown key",
        JSON.stringify({ v: 1, events: [{ ...good, ip: "1.2.3.4" }] }),
      ],
      [
        "one bad event among good ones",
        JSON.stringify({ v: 1, events: [good, { ...good, name: "Bad Name" }] }),
      ],
      [
        "a property that is nested",
        JSON.stringify({ v: 1, events: [{ ...good, properties: { a: { b: 1 } } }] }),
      ],
      ["far too much", `{"v":1,"events":[],"pad":"${"x".repeat(2_000_000)}"}`],
    ])("(%s)", async (_label, text) => {
      const world = createWorld();
      world.local.seed(QUEUE_KEY, text);
      const tab = returningTab(world);
      await tab.tracker.flush();
      expect(world.collector.requests).toEqual([]);
      expect(world.local.peek(QUEUE_KEY)).toBeNull();
      expect(({} as { x?: number }).x).toBeUndefined();
    });

    it("accepts a well-formed queue", async () => {
      const world = createWorld();
      world.local.seed(
        QUEUE_KEY,
        JSON.stringify({ v: 1, events: [{ ...good, at: world.clock.now() }] }),
      );
      const tab = returningTab(world);
      await tab.tracker.flush();
      expect(world.collector.deliveredEvents()).toHaveLength(1);
    });

    it("drops duplicate ids and an event that alone is over the payload cap", async () => {
      const world = createWorld();
      const event = { ...good, at: world.clock.now() };
      const huge = {
        ...good,
        id: "CCCCCCCCCCCCCCCCCCCCCC",
        at: world.clock.now(),
        properties: { a: "x".repeat(1024), b: "x".repeat(1024) },
      };
      world.local.seed(QUEUE_KEY, JSON.stringify({ v: 1, events: [event, event, huge] }));
      const tab = returningTab(world, { maxPayloadBytes: 1024 });
      await tab.tracker.flush();
      expect(world.collector.deliveredEvents()).toHaveLength(1);
      expect(tab.drops.map((drop) => drop.code)).toContain("event-too-large");
    });
  });

  describe("when storage misbehaves", () => {
    it("keeps delivering from memory when a write hits the quota", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.local.failWrites(true);
      trackMany(tab, 3);
      await tab.tracker.flush();
      expect(world.collector.deliveredEvents()).toHaveLength(3);
      expect(tab.drops).toEqual([]);
    });

    it("fails closed when storage stops answering: nothing is sent", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      trackMany(tab, 1);
      world.local.failAll(true);
      trackMany(tab, 1);
      await tab.tracker.flush();
      await settle();
      expect(world.collector.requests).toEqual([]);
    });

    it("works when session storage is full", async () => {
      const world = createWorld();
      const tab = grantedTab(world, {
        sessionStorage: createMemoryStorage({ quotaCharacters: 1 }),
      });
      trackMany(tab, 2);
      await tab.tracker.flush();
      expect(world.collector.deliveredEvents()).toHaveLength(2);
    });
  });
});
