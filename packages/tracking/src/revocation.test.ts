import { describe, expect, it } from "vitest";
import type { ConsentStatus } from "./tracker-types.ts";
import {
  CONSENT_KEY,
  QUEUE_KEY,
  SESSION_KEY,
  changesSince,
  consentRecord,
  createWorld,
  grantedTab,
  openTab,
  sessionIdsSent,
  settle,
} from "./test-harness.ts";

const HOUR = 3_600_000;

describe("revoking consent", () => {
  it("drops the queue, removes every key but the consent record, cancels timers and says denied", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("clicked", { target: "a" });
    tab.tracker.track("clicked", { target: "b" });
    expect(world.local.peek(QUEUE_KEY)).not.toBeNull();
    expect(tab.session.peek(SESSION_KEY)).not.toBeNull();
    expect(world.clock.pendingTimers()).toBeGreaterThan(0);

    tab.tracker.consent.deny();

    expect(world.local.keys()).toEqual([CONSENT_KEY]);
    expect(JSON.parse(world.local.peek(CONSENT_KEY) ?? "null")).toMatchObject({
      state: "denied",
      version: 1,
    });
    expect(tab.session.keys()).toEqual([]);
    expect(world.clock.pendingTimers()).toBe(0);
    world.clock.advance(HOUR);
    await tab.tracker.flush();
    await settle();
    expect(world.collector.requests).toEqual([]);
  });

  it("removes every key, the consent record included, on reset", () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("clicked", { target: "a" });
    tab.tracker.consent.reset();
    expect(world.local.keys()).toEqual([]);
    expect(tab.session.keys()).toEqual([]);
    expect(world.clock.pendingTimers()).toBe(0);
    expect(tab.tracker.consent.get()).toMatchObject({ state: "unknown" });
  });

  it.each(["deny", "reset"] as const)("rotates the session id away on %s()", async (revoke) => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.track("clicked", { target: "before" });
    await tab.tracker.flush();
    tab.tracker.consent[revoke]();
    tab.tracker.consent.grant();
    tab.tracker.track("clicked", { target: "after" });
    await tab.tracker.flush();
    const sessions = world.collector.deliveredEvents().map((event) => event.session);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).not.toBe(sessions[1]);
  });

  it("forgets who was identified", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.identify("user_1");
    tab.tracker.consent.deny();
    tab.tracker.consent.grant();
    tab.tracker.track("clicked", { target: "x" });
    await tab.tracker.flush();
    expect(world.collector.deliveredEvents()[0]).not.toHaveProperty("user");
  });

  it("cleans up what an older consent version left behind, and keeps its record", () => {
    const world = createWorld();
    const first = grantedTab(world);
    first.tracker.track("clicked", { target: "a" });
    first.tracker.dispose();
    expect(world.local.peek(QUEUE_KEY)).not.toBeNull();
    const second = openTab(world, { consentVersion: 2 });
    expect(second.tracker.consent.get()).toMatchObject({ state: "unknown" });
    expect(world.local.peek(QUEUE_KEY)).toBeNull();
    expect(world.local.peek(CONSENT_KEY)).toBe(consentRecord("granted", 1));
  });

  describe("while a request is in flight", () => {
    it("cannot recall it, and leaves no retry, no queue and no write behind", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.collector.answer("hang");
      tab.tracker.track("clicked", { target: "a" });
      const flushed = tab.tracker.flush();
      await settle();
      expect(world.collector.inFlight).toBe(1);

      tab.tracker.consent.deny();
      const calls = world.local.calls.length;
      world.collector.releaseHanging({ status: 500 });
      await flushed;
      world.clock.advance(HOUR);
      await settle();

      expect(world.collector.requests).toHaveLength(1);
      expect(world.clock.pendingTimers()).toBe(0);
      expect(changesSince(world.local, calls)).toEqual([]);
      expect(world.local.keys()).toEqual([CONSENT_KEY]);
      expect(tab.drops).toEqual([]);
    });

    it("writes nothing when the request it could not recall is answered", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.collector.answer("hang");
      tab.tracker.track("clicked", { target: "a" });
      const flushed = tab.tracker.flush();
      await settle();
      tab.tracker.consent.reset();
      const calls = world.local.calls.length;
      world.collector.releaseHanging({ status: 202 });
      await flushed;
      expect(changesSince(world.local, calls)).toEqual([]);
      expect(world.local.keys()).toEqual([]);
    });

    it("never sends a second request while the old one hangs, then sends only new events", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.collector.answer("hang");
      tab.tracker.track("clicked", { target: "old" });
      const flushed = tab.tracker.flush();
      await settle();
      tab.tracker.consent.deny();
      tab.tracker.consent.grant();
      tab.tracker.track("clicked", { target: "new" });
      world.clock.advance(10_000);
      await settle();
      expect(world.collector.requests).toHaveLength(1);

      world.collector.releaseHanging({ status: 202 });
      await flushed;
      await settle();
      world.clock.advance(10_000);
      await settle();
      expect(world.collector.requests).toHaveLength(2);
      const last = world.collector.batches()[1];
      expect(last?.events.map((event) => event.properties)).toEqual([{ target: "new" }]);
      expect(world.collector.maxInFlight).toBe(1);
    });
  });

  describe("during a backoff", () => {
    it("cancels the retry and drops the batch", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.collector.answer({ status: 503 });
      tab.tracker.track("clicked", { target: "a" });
      await tab.tracker.flush();
      expect(world.clock.pendingTimers()).toBe(1);
      tab.tracker.consent.deny();
      expect(world.clock.pendingTimers()).toBe(0);
      world.clock.advance(HOUR);
      await settle();
      expect(world.collector.requests).toHaveLength(1);
      expect(world.local.keys()).toEqual([CONSENT_KEY]);
    });

    it("cancels a long Retry-After wait too", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      world.collector.answer({ status: 429, headers: { "Retry-After": "3600" } });
      tab.tracker.track("clicked", { target: "a" });
      await tab.tracker.flush();
      tab.tracker.consent.reset();
      expect(world.clock.pendingTimers()).toBe(0);
    });
  });

  describe("in another tab", () => {
    it("reaches the others and has the same effects there", async () => {
      const world = createWorld();
      const a = openTab(world);
      const b = openTab(world);
      a.tracker.consent.grant();
      expect(b.tracker.consent.get()).toMatchObject({ state: "granted" });
      a.tracker.track("clicked", { target: "a" });
      b.tracker.track("clicked", { target: "b" });
      const heard: ConsentStatus[] = [];
      b.tracker.consent.onChange((status) => heard.push(status));

      a.tracker.consent.deny();

      expect(heard).toMatchObject([{ state: "denied" }]);
      expect(b.session.keys()).toEqual([]);
      expect(a.session.keys()).toEqual([]);
      expect(world.local.keys()).toEqual([CONSENT_KEY]);
      expect(world.clock.pendingTimers()).toBe(0);
      world.clock.advance(HOUR);
      await b.tracker.flush();
      await settle();
      expect(world.collector.requests).toEqual([]);
    });

    it("reaches the others on reset", () => {
      const world = createWorld();
      const a = openTab(world);
      const b = openTab(world);
      a.tracker.consent.grant();
      b.tracker.track("clicked", { target: "b" });
      a.tracker.consent.reset();
      expect(b.tracker.consent.get()).toMatchObject({ state: "unknown" });
      expect(world.local.keys()).toEqual([]);
      expect(b.session.keys()).toEqual([]);
    });

    it("is checked at every send, so a notice still on its way cannot let a send through", async () => {
      const world = createWorld({ manualHub: true });
      const a = openTab(world);
      const b = openTab(world);
      a.tracker.consent.grant();
      world.hub.deliver();
      b.tracker.track("clicked", { target: "b" });
      a.tracker.consent.deny();
      await b.tracker.flush();
      world.clock.advance(10_000);
      await settle();
      expect(world.collector.requests).toEqual([]);
      expect(b.session.keys()).toEqual([]);
      expect(world.local.keys()).toEqual([CONSENT_KEY]);
    });

    it("is noticed at the next call even with no channel at all", async () => {
      const world = createWorld();
      const a = openTab(world, { crossTab: null });
      const b = openTab(world, { crossTab: null });
      a.tracker.consent.grant();
      b.tracker.track("clicked", { target: "b" });
      a.tracker.consent.deny();
      b.tracker.track("clicked", { target: "after" });
      world.clock.advance(10_000);
      await settle();
      expect(world.collector.requests).toEqual([]);
      expect(b.session.keys()).toEqual([]);
    });

    it("ignores a message that is not the consent notice", () => {
      const world = createWorld();
      const a = openTab(world);
      const b = world.hub.connect();
      a.tracker.consent.grant();
      b.post({ type: "something-else", state: "denied" });
      expect(a.tracker.consent.get()).toMatchObject({ state: "granted" });
    });
  });

  describe("by Global Privacy Control or Do Not Track appearing", () => {
    it.each([
      [
        "gpc",
        (tab: ReturnType<typeof openTab>) => {
          tab.page.setGpc(true);
        },
      ],
      [
        "dnt",
        (tab: ReturnType<typeof openTab>) => {
          tab.page.setDnt("1");
        },
      ],
    ] as const)(
      "treats %s as a revocation that keeps the consent record",
      async (reason, appear) => {
        const world = createWorld();
        const tab = grantedTab(world);
        tab.tracker.track("clicked", { target: "a" });
        appear(tab);
        expect(tab.tracker.consent.get()).toMatchObject({ state: "denied", reason });
        expect(world.local.keys()).toEqual([CONSENT_KEY]);
        expect(world.local.peek(CONSENT_KEY)).toBe(consentRecord("granted"));
        expect(tab.session.keys()).toEqual([]);
        expect(world.clock.pendingTimers()).toBe(0);
        world.clock.advance(HOUR);
        await settle();
        expect(world.collector.requests).toEqual([]);
      },
    );

    it("lets tracking resume, on a new session, when the signal goes away", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      tab.tracker.track("clicked", { target: "before" });
      await tab.tracker.flush();
      tab.page.setGpc(true);
      tab.tracker.track("clicked", { target: "during" });
      tab.page.setGpc(undefined);
      tab.tracker.track("clicked", { target: "after" });
      await tab.tracker.flush();
      expect(world.collector.deliveredEvents().map((event) => event.properties)).toEqual([
        { target: "before" },
        { target: "after" },
      ]);
      expect(sessionIdsSent(world)).toHaveLength(2);
    });

    it("blocks a send that is already due when the signal appears", async () => {
      const world = createWorld();
      const tab = grantedTab(world);
      tab.tracker.track("clicked", { target: "a" });
      tab.page.setDnt("1");
      world.clock.advance(5000);
      await settle();
      expect(world.collector.requests).toEqual([]);
    });
  });
});
