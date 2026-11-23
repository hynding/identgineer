import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "./testing/memory-storage.ts";
import { QUEUE_KEY, WRITE_KEY, createWorld, openTab, settle } from "./test-harness.ts";

// Two trackers on one page that share storage would each hold a queue, a session and a timer for
// the same keys, so one is made and shared until it is disposed.
describe("two trackers for the same endpoint, key and storage", () => {
  it("are one tracker until it is disposed", () => {
    const world = createWorld();
    const session = createMemoryStorage();
    const first = openTab(world, { session });
    const second = openTab(world, { session });
    expect(second.tracker).toBe(first.tracker);
    first.tracker.dispose();
    const third = openTab(world, { session });
    expect(third.tracker).not.toBe(first.tracker);
    const fourth = openTab(world, { session });
    expect(fourth.tracker).toBe(third.tracker);
  });

  it("listen on the channel once, and queue an event once", async () => {
    const world = createWorld();
    const session = createMemoryStorage();
    const first = openTab(world, { session });
    openTab(world, { session }).tracker.consent.grant();
    expect(world.hub.listenerCount()).toBe(1);
    first.tracker.track("clicked", { target: "a" });
    await first.tracker.flush();
    await settle();
    expect(world.collector.deliveredEvents()).toHaveLength(1);
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it.each([
    ["another write key", { writeKey: `${WRITE_KEY}_other` }],
    ["another endpoint", { endpoint: "https://collect.example.org/v1/events" }],
    ["another session storage", { session: createMemoryStorage() }],
  ])("are two trackers for %s", (_label, overrides) => {
    const world = createWorld();
    const session = createMemoryStorage();
    const first = openTab(world, { session });
    const other = openTab(world, { session, ...overrides });
    expect(other.tracker).not.toBe(first.tracker);
  });

  it("are two trackers for another local storage", () => {
    const session = createMemoryStorage();
    const first = openTab(createWorld(), { session });
    const other = openTab(createWorld(), { session });
    expect(other.tracker).not.toBe(first.tracker);
  });

  it("are never shared when there is no storage to share", () => {
    const world = createWorld();
    const first = openTab(world, { localStorage: null, sessionStorage: null });
    const second = openTab(world, { localStorage: null, sessionStorage: null });
    expect(second.tracker).not.toBe(first.tracker);
  });

  it("still refuse an invalid option when the first tracker exists", () => {
    const world = createWorld();
    const session = createMemoryStorage();
    openTab(world, { session });
    expect(() => openTab(world, { session, flushInterval: -1 })).toThrow(TypeError);
  });

  it("does not hand out a disposed tracker, whichever of the two disposes it", () => {
    const world = createWorld();
    const session = createMemoryStorage();
    const first = openTab(world, { session });
    const second = openTab(world, { session });
    second.tracker.dispose();
    first.tracker.dispose();
    const next = openTab(world, { session });
    expect(next.tracker).not.toBe(first.tracker);
    expect(next.tracker.consent.get()).toBeDefined();
  });
});
