import { describe, expect, it } from "vitest";
import type { ConsentStatus } from "./tracker-types.ts";
import {
  CONSENT_KEY,
  START,
  consentRecord,
  createWorld,
  grantedTab,
  openTab,
  settle,
} from "./test-harness.ts";
import { createMemoryStorage } from "./testing/memory-storage.ts";

describe("consent state machine", () => {
  it("starts unknown and writes nothing", () => {
    const world = createWorld();
    const tab = openTab(world);
    expect(tab.tracker.consent.get()).toEqual({ state: "unknown" });
    expect(world.local.calls.filter((call) => call.method !== "getItem")).toEqual([]);
  });

  it("stores a grant as one versioned record and says it was stored", () => {
    const world = createWorld();
    const tab = openTab(world);
    expect(tab.tracker.consent.grant()).toBe(true);
    expect(world.local.peek(CONSENT_KEY)).toBe(
      `{"state":"granted","version":1,"decidedAt":${String(START)}}`,
    );
    expect(tab.tracker.consent.get()).toEqual({ state: "granted" });
  });

  it("stores a denial and forgets a choice on reset", () => {
    const world = createWorld();
    const tab = openTab(world);
    tab.tracker.consent.deny();
    expect(world.local.peek(CONSENT_KEY)).toBe(consentRecord("denied"));
    expect(tab.tracker.consent.get()).toEqual({ state: "denied" });
    tab.tracker.consent.reset();
    expect(world.local.peek(CONSENT_KEY)).toBeNull();
    expect(tab.tracker.consent.get()).toEqual({ state: "unknown" });
  });

  it("reads a choice an earlier visit stored", () => {
    const world = createWorld();
    world.local.seed(CONSENT_KEY, consentRecord("granted"));
    expect(openTab(world).tracker.consent.get()).toEqual({ state: "granted" });
  });

  it("counts a record of an older consentVersion as unknown, and a new grant replaces it", () => {
    const world = createWorld();
    world.local.seed(CONSENT_KEY, consentRecord("granted", 1));
    const tab = openTab(world, { consentVersion: 2 });
    expect(tab.tracker.consent.get()).toEqual({ state: "unknown" });
    tab.tracker.consent.grant();
    expect(world.local.peek(CONSENT_KEY)).toBe(consentRecord("granted", 2));
  });

  it.each([
    ["not JSON", "{"],
    ["a record with another key", '{"state":"granted","version":1,"decidedAt":1,"x":1}'],
    ["an unknown state", '{"state":"unknown","version":1,"decidedAt":1}'],
    [
      "an own __proto__",
      '{"__proto__":{"state":"granted"},"state":"granted","version":1,"decidedAt":1}',
    ],
    ["a huge value", "x".repeat(100_000)],
  ])("treats %s in storage as unknown", (_label, stored) => {
    const world = createWorld();
    world.local.seed(CONSENT_KEY, stored);
    expect(openTab(world).tracker.consent.get()).toEqual({ state: "unknown" });
  });

  it("tells each listener of a change once, and not of a repeat", () => {
    const world = createWorld();
    const tab = openTab(world);
    const seen: ConsentStatus[] = [];
    tab.tracker.consent.onChange((status) => seen.push(status));
    tab.tracker.consent.grant();
    tab.tracker.consent.grant();
    tab.tracker.consent.deny();
    tab.tracker.consent.reset();
    expect(seen).toEqual([{ state: "granted" }, { state: "denied" }, { state: "unknown" }]);
  });

  it("stops telling a listener that unsubscribed, and survives one that throws", () => {
    const world = createWorld();
    const tab = openTab(world);
    const heard: string[] = [];
    const stop = tab.tracker.consent.onChange(() => heard.push("first"));
    tab.tracker.consent.onChange(() => {
      throw new Error("listener");
    });
    tab.tracker.consent.onChange(() => heard.push("third"));
    stop();
    expect(() => tab.tracker.consent.grant()).not.toThrow();
    expect(heard).toEqual(["third"]);
  });

  describe("Global Privacy Control and Do Not Track", () => {
    it.each([
      ["gpc", { gpc: true }],
      ["dnt", { dnt: "1" }],
    ] as const)(
      "make effective consent denied with the reason %s whatever was stored",
      (reason, signal) => {
        const world = createWorld();
        world.local.seed(CONSENT_KEY, consentRecord("granted"));
        const tab = openTab(world, signal);
        expect(tab.tracker.consent.get()).toEqual({ state: "denied", reason });
      },
    );

    it("makes an undecided visitor denied too, and names GPC before DNT", () => {
      const world = createWorld();
      const tab = openTab(world, { gpc: true, dnt: "1" });
      expect(tab.tracker.consent.get()).toEqual({ state: "denied", reason: "gpc" });
    });

    it.each([
      ["GPC set to false", { gpc: false }],
      ["Do Not Track of 0", { dnt: "0" }],
      ["Do Not Track unspecified", { dnt: "unspecified" }],
    ])("are not honoured for %s", (_label, signal) => {
      const world = createWorld();
      world.local.seed(CONSENT_KEY, consentRecord("granted"));
      expect(openTab(world, signal).tracker.consent.get()).toEqual({ state: "granted" });
    });

    it("do not let grant() enable sending, but the choice is recorded", async () => {
      const world = createWorld();
      const tab = openTab(world, { gpc: true });
      expect(tab.tracker.consent.grant()).toBe(true);
      expect(world.local.peek(CONSENT_KEY)).toBe(consentRecord("granted"));
      expect(tab.tracker.consent.get()).toEqual({ state: "denied", reason: "gpc" });
      tab.tracker.track("clicked", { target: "x" });
      await tab.tracker.flush();
      world.clock.advance(60_000);
      await settle();
      expect(world.collector.requests).toEqual([]);
    });

    it("are read at every use, so a signal that appears later counts at once", () => {
      const world = createWorld();
      const tab = grantedTab(world);
      const seen: ConsentStatus[] = [];
      tab.tracker.consent.onChange((status) => seen.push(status));
      tab.page.setGpc(true);
      expect(tab.tracker.consent.get()).toEqual({ state: "denied", reason: "gpc" });
      tab.page.setGpc(undefined);
      tab.page.setDnt("1");
      expect(tab.tracker.consent.get()).toEqual({ state: "denied", reason: "dnt" });
      tab.page.setDnt(undefined);
      expect(tab.tracker.consent.get()).toEqual({ state: "granted" });
      expect(seen).toEqual([
        { state: "denied", reason: "gpc" },
        { state: "denied", reason: "dnt" },
        { state: "granted" },
      ]);
    });
  });

  describe("when storage fails", () => {
    it("is unknown, and nothing throws, when every call throws", () => {
      const world = createWorld();
      world.local.failAll(true);
      const tab = openTab(world);
      expect(tab.tracker.consent.get()).toEqual({ state: "unknown" });
      expect(tab.tracker.consent.grant()).toBe(false);
      expect(tab.tracker.consent.deny()).toBe(false);
      expect(tab.tracker.consent.reset()).toBe(false);
      expect(tab.tracker.consent.get()).toEqual({ state: "unknown" });
    });

    it("is unknown when a stored grant cannot be read", () => {
      const world = createWorld();
      world.local.seed(CONSENT_KEY, consentRecord("granted"));
      world.local.failAll(true);
      expect(openTab(world).tracker.consent.get()).toEqual({ state: "unknown" });
    });

    it("cannot record a grant without storage, so nothing is enabled", () => {
      const world = createWorld();
      const tab = openTab(world, { localStorage: null });
      expect(tab.tracker.consent.grant()).toBe(false);
      expect(tab.tracker.consent.get()).toEqual({ state: "unknown" });
    });

    it("keeps a denial that could not be stored from being undone by the grant still in storage", () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.local.failWrites(true);
      expect(tab.tracker.consent.deny()).toBe(false);
      world.local.failWrites(false);
      expect(tab.tracker.consent.get()).toEqual({ state: "denied" });
    });

    it("keeps a reset that could not be stored from being undone by the grant still in storage", () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.local.failAll(true);
      tab.tracker.consent.reset();
      world.local.failAll(false);
      expect(tab.tracker.consent.get().state).not.toBe("granted");
    });

    it("lets a later successful grant take effect again", () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.local.failWrites(true);
      tab.tracker.consent.deny();
      world.local.failWrites(false);
      expect(tab.tracker.consent.grant()).toBe(true);
      expect(tab.tracker.consent.get()).toEqual({ state: "granted" });
    });

    it("works with session storage alone failing", () => {
      const world = createWorld();
      const session = createMemoryStorage();
      session.failAll(true);
      const tab = grantedTab(world, { session });
      expect(tab.tracker.consent.get()).toEqual({ state: "granted" });
    });
  });
});
