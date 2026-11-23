import { describe, expect, it } from "vitest";
import {
  QUEUE_KEY,
  SESSION_KEY,
  START,
  createWorld,
  grantedTab,
  openTab,
  returningTab,
  settle,
  type Tab,
  type World,
} from "./test-harness.ts";

const MINUTE = 60_000;

const storedEvents = (world: World): Record<string, unknown>[] =>
  (
    JSON.parse(world.local.peek(QUEUE_KEY) ?? '{"events":[]}') as {
      events: Record<string, unknown>[];
    }
  ).events;
const storedTargets = (world: World): unknown[] =>
  storedEvents(world).map((event) => (event.properties as { target?: string } | undefined)?.target);
const sessionOf = (tab: Tab): string =>
  (JSON.parse(tab.session.peek(SESSION_KEY) ?? "null") as { id: string }).id;
const track = (tab: Tab, target: string): void => {
  tab.world.clock.advance(1);
  tab.tracker.track("clicked", { target });
};

describe("the stored queue and the session id", () => {
  it("never holds the session id, nor does anything else in localStorage", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.identify("user_1");
    track(tab, "a");
    tab.tracker.page();
    const id = sessionOf(tab);
    expect(tab.world.local.peek(QUEUE_KEY)).not.toBeNull();
    for (const key of tab.world.local.keys()) {
      expect(tab.world.local.peek(key), key).not.toContain(id);
    }
    expect(storedEvents(tab.world).every((event) => !("session" in event))).toBe(true);
  });

  it("sends the events of an earlier page load with no session, and never gives them this one", async () => {
    const world = createWorld();
    const first = grantedTab(world);
    track(first, "earlier");
    const earlierSession = sessionOf(first);
    first.tracker.dispose();
    const second = returningTab(world);
    track(second, "later");
    await second.tracker.flush();
    const delivered = world.collector.deliveredEvents();
    expect(delivered.map((event) => event.properties?.target)).toEqual(["earlier", "later"]);
    expect(delivered[0]).not.toHaveProperty("session");
    expect(delivered[1]?.session).toBe(sessionOf(second));
    expect(sessionOf(second)).not.toBe(earlierSession);
    expect(world.collector.violations).toEqual([]);
  });
});

describe("two tabs sharing the stored queue", () => {
  const twoTabs = () => {
    const world = createWorld();
    const a = grantedTab(world, { maxBatchSize: 500 });
    const b = openTab(world, { maxBatchSize: 500 });
    a.page.goOffline();
    b.page.goOffline();
    return { world, a, b };
  };

  it("keeps the events of both: a tab writes what is stored plus its own", () => {
    const { world, a, b } = twoTabs();
    track(a, "from-a");
    track(b, "from-b");
    track(a, "from-a-again");
    expect(storedTargets(world)).toEqual(["from-a", "from-b", "from-a-again"]);
  });

  it("removes only what a tab delivered, so the other tab's events stay stored", async () => {
    const { world, a, b } = twoTabs();
    track(a, "from-a");
    track(b, "from-b");
    a.page.goOnline();
    await a.tracker.flush();
    expect(world.collector.deliveredEvents().map((event) => event.properties?.target)).toEqual([
      "from-a",
    ]);
    expect(storedTargets(world)).toEqual(["from-b"]);
    b.page.goOnline();
    await b.tracker.flush();
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it("does not remove the other tab's events when its own queue empties by expiry", async () => {
    const { world, a, b } = twoTabs();
    track(a, "from-a");
    world.clock.advance(23 * 60 * MINUTE);
    await settle();
    track(b, "from-b");
    world.clock.advance(2 * 60 * MINUTE);
    await settle();
    a.page.goOnline();
    await a.tracker.flush();
    expect(storedTargets(world)).toEqual(["from-b"]);
  });

  it("holds the caps over the merged queue, dropping the oldest first", () => {
    const world = createWorld();
    const a = grantedTab(world, { maxQueueEvents: 3 });
    const b = openTab(world, { maxQueueEvents: 3 });
    a.page.goOffline();
    b.page.goOffline();
    track(a, "1");
    track(b, "2");
    track(a, "3");
    track(b, "4");
    expect(storedTargets(world)).toEqual(["2", "3", "4"]);
  });

  it("holds the byte cap over the merged queue", () => {
    const world = createWorld();
    const a = grantedTab(world, { maxQueueBytes: 2048, maxBatchSize: 500 });
    const b = openTab(world, { maxQueueBytes: 2048, maxBatchSize: 500 });
    a.page.goOffline();
    b.page.goOffline();
    for (let index = 0; index < 20; index += 1) track(index % 2 === 0 ? a : b, "x".repeat(100));
    expect((world.local.peek(QUEUE_KEY) ?? "").length).toBeLessThanOrEqual(2048 + 64);
    expect(storedEvents(world).length).toBeGreaterThan(1);
  });

  it("does not bring back an event this tab delivered when the other tab writes", async () => {
    const { world, a, b } = twoTabs();
    track(a, "from-a");
    a.page.goOnline();
    await a.tracker.flush();
    track(b, "from-b");
    expect(storedTargets(world)).toEqual(["from-b"]);
  });
});

describe("stored events with a timestamp in the future", () => {
  const event = (id: string, at: number) => ({
    id: id.repeat(22).slice(0, 22),
    name: "clicked",
    at,
    properties: { target: id },
  });

  it("are dropped when they are more than five minutes ahead, and kept when they are not", async () => {
    const world = createWorld();
    world.local.seed(
      QUEUE_KEY,
      JSON.stringify({
        v: 1,
        events: [event("a", START + 5 * MINUTE), event("b", START + 5 * MINUTE + 1)],
      }),
    );
    const tab = returningTab(world);
    await tab.tracker.flush();
    expect(
      world.collector.deliveredEvents().map((delivered) => delivered.properties?.target),
    ).toEqual(["a"]);
    expect(tab.drops.map((drop) => drop.code)).toContain("expired");
    await settle();
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
  });
});
