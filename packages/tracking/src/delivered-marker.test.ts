import { describe, expect, it } from "vitest";
import {
  CONSENT_KEY,
  QUEUE_KEY,
  START,
  changesSince,
  createWorld,
  grantedTab,
  openTab,
  settle,
  type World,
} from "./test-harness.ts";

const DELIVERED_KEY = "idg.tracking.delivered.v1";
const HOUR = 3_600_000;

const marker = (world: World): { v: number; ids: [string, number][] } | null => {
  const text = world.local.peek(DELIVERED_KEY);
  return text === null ? null : (JSON.parse(text) as { v: number; ids: [string, number][] });
};

describe("the marker of delivered event ids", () => {
  it("keeps an event that two tabs both loaded from being sent a second time", async () => {
    const world = createWorld();
    const a = grantedTab(world);
    a.page.goOffline();
    a.tracker.track("clicked", { target: "x" });
    const b = openTab(world);
    expect(world.local.peek(QUEUE_KEY)).toContain('"x"');
    a.page.goOnline();
    await a.tracker.flush();
    expect(world.collector.deliveredEvents()).toHaveLength(1);
    world.clock.advance(1);
    b.tracker.track("clicked", { target: "y" });
    await b.tracker.flush();
    await settle();
    expect(world.collector.deliveredEvents().map((event) => event.properties?.target)).toEqual([
      "x",
      "y",
    ]);
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it("records the ids a tab delivered with their delivery time", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("clicked", { target: "x" });
    await tab.tracker.flush();
    const held = marker(world);
    expect(held?.v).toBe(1);
    expect(held?.ids).toHaveLength(1);
    expect(held?.ids[0]?.[1]).toBe(START);
  });

  it("holds at most 200 ids, the newest", async () => {
    const world = createWorld();
    const tab = grantedTab(world, { maxBatchSize: 500, maxQueueEvents: 500, fetch: null });
    for (let index = 0; index < 250; index += 1) tab.tracker.track("clicked", { target: "t" });
    tab.tracker.dispose();
    const sender = grantedTab(world, { maxBatchSize: 500, maxQueueEvents: 500 });
    await sender.tracker.flush();
    expect(world.collector.deliveredEvents()).toHaveLength(250);
    expect(marker(world)?.ids).toHaveLength(200);
  });

  it("forgets ids after 24 hours", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("clicked", { target: "old" });
    await tab.tracker.flush();
    const [[oldId]] = marker(world)?.ids as [[string, number]];
    world.clock.advance(25 * HOUR);
    tab.tracker.track("clicked", { target: "new" });
    await tab.tracker.flush();
    expect(marker(world)?.ids.map(([id]) => id)).not.toContain(oldId);
    expect(marker(world)?.ids).toHaveLength(1);
  });

  it.each([
    ["not JSON", "{"],
    ["another version", JSON.stringify({ v: 2, ids: [] })],
    ["an extra key", JSON.stringify({ v: 1, ids: [], extra: 1 })],
    ["a bad id", JSON.stringify({ v: 1, ids: [["short", 1]] })],
    ["a bad time", JSON.stringify({ v: 1, ids: [["A".repeat(22), "1"]] })],
    [
      "201 ids",
      JSON.stringify({ v: 1, ids: Array.from({ length: 201 }, () => ["A".repeat(22), 1]) }),
    ],
    ["an own __proto__", '{"v":1,"ids":[],"__proto__":{"x":1}}'],
    ["far too much", `{"v":1,"ids":[],"pad":"${"x".repeat(100_000)}"}`],
  ])("is discarded when it holds %s", async (_label, text) => {
    const world = createWorld();
    world.local.seed(
      CONSENT_KEY,
      JSON.stringify({ state: "granted", version: 1, decidedAt: START }),
    );
    world.local.seed(DELIVERED_KEY, text);
    const tab = openTab(world);
    tab.tracker.track("clicked", { target: "x" });
    await tab.tracker.flush();
    expect(world.collector.deliveredEvents()).toHaveLength(1);
    expect(marker(world)?.ids).toHaveLength(1);
  });

  it("is removed on revocation, like every other key", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("clicked", { target: "x" });
    await tab.tracker.flush();
    expect(marker(world)).not.toBeNull();
    tab.tracker.consent.deny();
    expect(world.local.keys()).toEqual([CONSENT_KEY]);
    tab.tracker.consent.grant();
    tab.tracker.consent.reset();
    expect(world.local.keys()).toEqual([]);
  });

  it("is never written without effective consent", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.world.collector.answer("hang");
    tab.tracker.track("clicked", { target: "x" });
    const flushed = tab.tracker.flush();
    await settle();
    tab.page.setGpc(true);
    const calls = world.local.calls.length;
    world.collector.releaseHanging({ status: 202 });
    await flushed;
    expect(changesSince(world.local, calls)).not.toContain(`setItem ${DELIVERED_KEY}`);
    expect(world.local.keys()).toEqual([CONSENT_KEY]);
  });
});
