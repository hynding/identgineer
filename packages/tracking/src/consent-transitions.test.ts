import { describe, expect, it } from "vitest";
import {
  CONSENT_KEY,
  QUEUE_KEY,
  createWorld,
  grantedTab,
  openTab,
  settle,
} from "./test-harness.ts";

const targets = (world: ReturnType<typeof createWorld>): unknown[] =>
  world.collector.deliveredEvents().map((event) => event.properties?.target);

describe("a revocation that this tab did not see", () => {
  it("is noticed when only the later grant is seen, even within the same millisecond", async () => {
    const world = createWorld({ manualHub: true });
    const a = grantedTab(world);
    a.tracker.identify("user_1");
    a.tracker.track("clicked", { target: "old" });
    const b = openTab(world);
    b.tracker.consent.deny();
    b.tracker.consent.grant();
    // The channel's notices are held back: A has seen neither the denial nor the grant.
    a.tracker.track("clicked", { target: "new" });
    await a.tracker.flush();
    expect(targets(world)).toEqual(["new"]);
    expect(world.collector.deliveredEvents().some((event) => event.user !== undefined)).toBe(false);
  });

  it("is noticed after time has passed too", async () => {
    const world = createWorld({ manualHub: true });
    const a = grantedTab(world);
    a.tracker.track("clicked", { target: "old" });
    const b = openTab(world);
    b.tracker.consent.deny();
    world.clock.advance(1000);
    b.tracker.consent.grant();
    a.tracker.track("clicked", { target: "new" });
    await a.tracker.flush();
    expect(targets(world)).toEqual(["new"]);
  });

  it("is not assumed when this tab grants again itself", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.identify("user_1");
    tab.tracker.track("clicked", { target: "kept" });
    tab.tracker.consent.grant();
    await tab.tracker.flush();
    expect(targets(world)).toEqual(["kept"]);
    expect(world.collector.deliveredEvents()[0]?.user).toBe("user_1");
  });

  it("writes a decision time that never repeats, so two decisions in a millisecond differ", () => {
    const world = createWorld();
    const tab = openTab(world);
    const times: number[] = [];
    for (const decide of [
      () => tab.tracker.consent.grant(),
      () => tab.tracker.consent.deny(),
      () => tab.tracker.consent.grant(),
    ]) {
      decide();
      times.push(
        (JSON.parse(world.local.peek(CONSENT_KEY) ?? "null") as { decidedAt: number }).decidedAt,
      );
    }
    expect(new Set(times).size).toBe(3);
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });
});

describe("a revocation when the storage cannot be read", () => {
  it("still removes the stored queue", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("clicked", { target: "a" });
    expect(world.local.peek(QUEUE_KEY)).not.toBeNull();
    world.local.failReads(true);
    tab.tracker.consent.deny();
    await settle();
    world.local.failReads(false);
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it("removes it when the unreadable consent record makes consent unknown", () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("clicked", { target: "a" });
    world.local.failReads(true);
    expect(tab.tracker.consent.get()).toMatchObject({ state: "unknown" });
    world.local.failReads(false);
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
  });
});
