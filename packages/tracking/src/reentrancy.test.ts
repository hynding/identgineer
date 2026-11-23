import { describe, expect, it } from "vitest";
import type { ConsentStatus } from "./tracker-types.ts";
import type { Tab } from "./test-harness.ts";
import { CONSENT_KEY, createWorld, grantedTab, settle } from "./test-harness.ts";

const HOUR = 3_600_000;

// A page's callbacks run inside the tracker's own steps and may call the tracker back.
describe("a callback that calls the tracker back", () => {
  it("cannot get an event enqueued after onDrop revoked consent in the middle of track()", async () => {
    const world = createWorld();
    const holder: { tab?: Tab } = {};
    const tab = grantedTab(world, {
      onDrop: () => {
        holder.tab?.tracker.consent.deny();
      },
    });
    holder.tab = tab;
    // The undeclared property is dropped (and reported) while the event itself is built.
    tab.tracker.track("clicked", { target: "a", unexpected: "b" });
    await settle();
    expect(world.local.keys()).toEqual([CONSENT_KEY]);
    expect(world.clock.pendingTimers()).toBe(0);
    world.clock.advance(HOUR);
    await settle();
    expect(world.collector.requests).toEqual([]);
  });

  it("cannot get a page view enqueued after onDrop revoked consent", async () => {
    const world = createWorld();
    const holder: { tab?: Tab } = {};
    const tab = grantedTab(world, {
      onDrop: () => {
        holder.tab?.tracker.consent.reset();
      },
    });
    holder.tab = tab;
    tab.tracker.page({ path: "javascript:alert(1)" });
    tab.tracker.track("clicked", { target: "a", unexpected: "b" });
    await settle();
    expect(world.local.keys()).toEqual([]);
    expect(world.clock.pendingTimers()).toBe(0);
    expect(world.collector.requests).toEqual([]);
  });

  it("leaves no timer or request behind when onDrop disposes the tracker during an overflow", async () => {
    const world = createWorld();
    const holder: { tab?: Tab } = {};
    const tab = grantedTab(world, {
      maxQueueEvents: 1,
      onDrop: () => {
        holder.tab?.tracker.dispose();
      },
    });
    holder.tab = tab;
    tab.tracker.track("clicked", { target: "a" });
    tab.tracker.track("clicked", { target: "b" });
    await settle();
    expect(world.clock.pendingTimers()).toBe(0);
    world.clock.advance(HOUR);
    await settle();
    expect(world.collector.requests).toEqual([]);
  });

  it("is told of every status change in order by every listener, whatever a listener calls", () => {
    const world = createWorld();
    const tab = grantedTab(world);
    const first: string[] = [];
    const second: string[] = [];
    tab.tracker.consent.onChange((status: ConsentStatus) => {
      first.push(status.state);
      if (status.state === "denied") tab.tracker.consent.grant();
    });
    tab.tracker.consent.onChange((status: ConsentStatus) => {
      second.push(status.state);
    });
    tab.tracker.consent.deny();
    expect(first).toEqual(["denied", "granted"]);
    expect(second).toEqual(["denied", "granted"]);
    expect(tab.tracker.consent.get()).toMatchObject({ state: "granted" });
  });

  it("survives a listener that disposes the tracker, calls track() or denies again", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.consent.onChange((status) => {
      if (status.state === "denied") {
        tab.tracker.track("clicked", { target: "x" });
        tab.tracker.consent.deny();
        tab.tracker.dispose();
        tab.tracker.consent.grant();
      }
    });
    expect(() => tab.tracker.consent.deny()).not.toThrow();
    await settle();
    world.clock.advance(HOUR);
    await settle();
    expect(world.collector.requests).toEqual([]);
    expect(world.clock.pendingTimers()).toBe(0);
  });

  it("does not deliver an event tracked by a listener while consent is being revoked", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.consent.onChange(() => {
      tab.tracker.track("clicked", { target: "during" });
    });
    tab.tracker.consent.deny();
    await settle();
    world.clock.advance(HOUR);
    await settle();
    expect(world.collector.requests).toEqual([]);
    expect(world.local.keys()).toEqual([CONSENT_KEY]);
  });
});
