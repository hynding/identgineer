import { describe, expect, it } from "vitest";
import {
  ENDPOINT,
  QUEUE_KEY,
  WRITE_KEY,
  createWorld,
  grantedTab,
  settle,
  type Tab,
} from "./test-harness.ts";

const SECOND = 1000;

const trackMany = (tab: Tab, count: number): void => {
  for (let index = 0; index < count; index += 1) tab.tracker.track("clicked", { target: `t${String(index)}` });
};

const clean = (tab: Tab): void => {
  expect(tab.world.collector.violations).toEqual([]);
};

describe("batching", () => {
  it("flushes when the queue reaches maxBatchSize, 20 by default", async () => {
    const tab = grantedTab(createWorld());
    trackMany(tab, 19);
    await settle();
    expect(tab.world.collector.requests).toEqual([]);
    trackMany(tab, 1);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    expect(tab.world.collector.batches()[0]?.events).toHaveLength(20);
    clean(tab);
  });

  it("takes maxBatchSize from the option and sends the rest in further requests", async () => {
    const tab = grantedTab(createWorld(), { maxBatchSize: 3 });
    trackMany(tab, 7);
    await settle();
    expect(tab.world.collector.batches().map((batch) => batch.events.length)).toEqual([3, 3]);
    tab.world.clock.advance(5 * SECOND);
    await settle();
    expect(tab.world.collector.batches().map((batch) => batch.events.length)).toEqual([3, 3, 1]);
    clean(tab);
  });

  it("flushes after flushInterval, 5 seconds by default", async () => {
    const tab = grantedTab(createWorld());
    trackMany(tab, 2);
    tab.world.clock.advance(4999);
    await settle();
    expect(tab.world.collector.requests).toEqual([]);
    tab.world.clock.advance(1);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    clean(tab);
  });

  it("takes flushInterval from the option", async () => {
    const tab = grantedTab(createWorld(), { flushInterval: 100 });
    trackMany(tab, 1);
    tab.world.clock.advance(100);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
  });

  it("holds no timer once everything is delivered", async () => {
    const tab = grantedTab(createWorld());
    trackMany(tab, 1);
    await tab.tracker.flush();
    expect(tab.world.clock.pendingTimers()).toBe(0);
  });

  it("sends order-preserving batches and each event exactly once", async () => {
    const tab = grantedTab(createWorld(), { maxBatchSize: 4 });
    trackMany(tab, 10);
    await tab.tracker.flush();
    const events = tab.world.collector.deliveredEvents();
    expect(events.map((event) => event.properties)).toEqual(
      Array.from({ length: 10 }, (_v, index) => ({ target: `t${String(index)}` })),
    );
    expect(new Set(events.map((event) => event.id)).size).toBe(10);
  });
});

describe("the request", () => {
  it("is a CORS fetch without credentials, a referrer, a cache or a redirect, with the key in a header", async () => {
    const tab = grantedTab(createWorld());
    trackMany(tab, 1);
    await tab.tracker.flush();
    const [request] = tab.world.collector.requests;
    expect(request?.via).toBe("fetch");
    expect(request?.url).toBe(ENDPOINT);
    expect(request?.headers).toEqual({
      "Content-Type": "application/json",
      "X-Idg-Write-Key": WRITE_KEY,
    });
    expect(request?.keepalive).toBe(false);
    expect(request?.body).not.toContain(WRITE_KEY);
    expect(JSON.parse(request?.body ?? "{}")).toMatchObject({ v: 1 });
    clean(tab);
  });

  it("is the injected fetch's only business: a fetch given as null sends nothing", async () => {
    const tab = grantedTab(createWorld(), { fetch: null, sendBeacon: null });
    trackMany(tab, 25);
    await tab.tracker.flush();
    tab.page.hide();
    expect(tab.world.collector.requests).toEqual([]);
  });

  it("keeps at most one request in flight, however it is asked", async () => {
    const tab = grantedTab(createWorld(), { maxBatchSize: 2 });
    tab.world.collector.answer("hang");
    trackMany(tab, 6);
    const first = tab.tracker.flush();
    const second = tab.tracker.flush();
    tab.world.clock.advance(10 * SECOND);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    tab.world.collector.releaseHanging();
    await Promise.all([first, second]);
    expect(tab.world.collector.requests).toHaveLength(3);
    expect(tab.world.collector.maxInFlight).toBe(1);
    clean(tab);
  });

  it("flush() resolves once the queue is delivered, and at once when there is nothing", async () => {
    const tab = grantedTab(createWorld());
    await tab.tracker.flush();
    expect(tab.world.collector.requests).toEqual([]);
    trackMany(tab, 3);
    await tab.tracker.flush();
    expect(tab.world.collector.deliveredEvents()).toHaveLength(3);
  });
});

describe("the payload cap", () => {
  it("splits a batch that would be over maxPayloadBytes, and never sends a body over it", async () => {
    const tab = grantedTab(createWorld(), { maxPayloadBytes: 1024, maxBatchSize: 100 });
    for (let index = 0; index < 12; index += 1) tab.tracker.track("clicked", { target: "x".repeat(200) });
    await tab.tracker.flush();
    const { requests } = tab.world.collector;
    expect(requests.length).toBeGreaterThan(1);
    for (const request of requests) expect(request.bytes).toBeLessThanOrEqual(1024);
    expect(tab.world.collector.deliveredEvents()).toHaveLength(12);
    clean(tab);
  });

  it("counts bytes, not characters", async () => {
    const tab = grantedTab(createWorld(), { maxPayloadBytes: 1024, maxStringLength: 1024 });
    for (let index = 0; index < 5; index += 1) tab.tracker.track("clicked", { target: "€".repeat(100) });
    await tab.tracker.flush();
    for (const request of tab.world.collector.requests) expect(request.bytes).toBeLessThanOrEqual(1024);
    expect(tab.world.collector.deliveredEvents()).toHaveLength(5);
  });

  it("drops a single event that alone exceeds it and reports that", async () => {
    const tab = grantedTab(createWorld(), { maxPayloadBytes: 1024, maxStringLength: 1024 });
    tab.tracker.track("wide", { a: "x".repeat(1024), b: "x".repeat(1024), c: "x", d: "x", e: "x" });
    tab.tracker.track("logout");
    await tab.tracker.flush();
    expect(tab.drops.map((drop) => drop.code)).toEqual(["event-too-large"]);
    expect(tab.world.collector.deliveredEvents().map((event) => event.name)).toEqual(["logout"]);
    clean(tab);
  });
});

describe("retry", () => {
  const retrying = (): Tab => grantedTab(createWorld(), { random: () => 1 });

  it.each([
    ["a 500", { status: 500 }],
    ["a 503", { status: 503 }],
    ["a 429", { status: 429 }],
    ["a network failure", "network-error" as const],
  ])("keeps the batch after %s and sends it again after a backoff", async (_label, answer) => {
    const tab = retrying();
    tab.world.collector.answer(answer);
    trackMany(tab, 2);
    await tab.tracker.flush();
    expect(tab.world.collector.requests).toHaveLength(1);
    tab.world.clock.advance(999);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    tab.world.clock.advance(1);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(2);
    const [first, second] = tab.world.collector.batches();
    expect(second?.events.map((event) => event.id)).toEqual(first?.events.map((event) => event.id));
    expect(tab.world.collector.deliveredEvents()).toHaveLength(2);
    expect(tab.world.clock.pendingTimers()).toBe(0);
    clean(tab);
  });

  it("doubles the wait while failures continue, up to a cap", async () => {
    const tab = retrying();
    tab.world.collector.setDefault({ status: 500 });
    trackMany(tab, 1);
    await tab.tracker.flush();
    const waits: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const before = tab.world.collector.requests.length;
      let waited = 0;
      while (tab.world.collector.requests.length === before && waited < 400 * SECOND) {
        tab.world.clock.advance(SECOND);
        waited += SECOND;
        await settle();
      }
      waits.push(waited / SECOND);
    }
    expect(waits.slice(0, 6)).toEqual([1, 2, 4, 8, 16, 32]);
    expect(Math.max(...waits)).toBe(300);
  });

  it("jitters the wait between half and all of the step with the injected random", async () => {
    const tab = grantedTab(createWorld(), { random: () => 0 });
    tab.world.collector.answer({ status: 500 });
    trackMany(tab, 1);
    await tab.tracker.flush();
    tab.world.clock.advance(499);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    tab.world.clock.advance(1);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(2);
  });

  it("goes back to the first step after a success", async () => {
    const tab = retrying();
    tab.world.collector.answer({ status: 500 }, { status: 500 });
    trackMany(tab, 1);
    await tab.tracker.flush();
    tab.world.clock.advance(1000);
    await settle();
    tab.world.clock.advance(2000);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(3);
    trackMany(tab, 1);
    tab.world.collector.answer({ status: 500 });
    await tab.tracker.flush();
    tab.world.clock.advance(999);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(4);
    tab.world.clock.advance(1);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(5);
  });

  it("holds the batch back from every other trigger while it waits", async () => {
    const tab = retrying();
    tab.world.collector.answer({ status: 500 });
    trackMany(tab, 1);
    await tab.tracker.flush();
    await tab.tracker.flush();
    trackMany(tab, 25);
    tab.page.hide();
    tab.page.goOnline();
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    tab.world.clock.advance(SECOND);
    await settle();
    expect(tab.world.collector.deliveredEvents()).toHaveLength(26);
    clean(tab);
  });

  describe("Retry-After", () => {
    it("is honoured in seconds", async () => {
      const tab = retrying();
      tab.world.collector.answer({ status: 429, headers: { "Retry-After": "30" } });
      trackMany(tab, 1);
      await tab.tracker.flush();
      tab.world.clock.advance(29 * SECOND);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(1);
      tab.world.clock.advance(SECOND);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(2);
    });

    it("is honoured as an HTTP date", async () => {
      const tab = retrying();
      const at = new Date(tab.world.clock.now() + 90 * SECOND).toUTCString();
      tab.world.collector.answer({ status: 503, headers: { "Retry-After": at } });
      trackMany(tab, 1);
      await tab.tracker.flush();
      tab.world.clock.advance(89 * SECOND);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(1);
      tab.world.clock.advance(SECOND);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(2);
    });

    it("is capped at an hour", async () => {
      const tab = retrying();
      tab.world.collector.answer({ status: 429, headers: { "Retry-After": "999999" } });
      trackMany(tab, 1);
      await tab.tracker.flush();
      tab.world.clock.advance(3600 * SECOND - 1);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(1);
      tab.world.clock.advance(1);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(2);
    });

    it.each(["soon", "-5", "1.5", "NaN", "", "1e3", "Wed, 99 Foo 2026 99:99:99 GMT"])(
      "falls back to the backoff for %j",
      async (header) => {
        const tab = retrying();
        tab.world.collector.answer({ status: 429, headers: { "Retry-After": header } });
        trackMany(tab, 1);
        await tab.tracker.flush();
        tab.world.clock.advance(SECOND);
        await settle();
        expect(tab.world.collector.requests).toHaveLength(2);
      },
    );
  });
});

describe("rejection", () => {
  it.each([400, 401, 403, 404, 413, 422])("drops the batch on a %i, reports it and does not retry", async (status) => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer({ status });
    trackMany(tab, 2);
    await tab.tracker.flush();
    tab.world.clock.advance(3600 * SECOND);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    expect(tab.drops).toHaveLength(1);
    expect(tab.drops[0]?.code).toBe("rejected-by-server");
    expect(tab.drops[0]?.message).toContain(String(status));
    expect(tab.world.local.peek(QUEUE_KEY)).toBeNull();
    expect(tab.world.clock.pendingTimers()).toBe(0);
  });

  it("goes on to send what came after", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer({ status: 400 });
    trackMany(tab, 1);
    await tab.tracker.flush();
    trackMany(tab, 1);
    await tab.tracker.flush();
    expect(tab.world.collector.deliveredEvents()).toHaveLength(1);
  });
});

describe("hostile answers", () => {
  it.each([
    ["no status", () => Promise.resolve({ headers: { get: () => null } })],
    ["a status that is not a number", () => Promise.resolve({ status: "200", headers: { get: () => null } })],
    ["no headers on a 429", () => Promise.resolve({ status: 429 })],
    ["headers that throw", () => Promise.resolve({ status: 503, headers: { get: () => { throw new Error("hostile"); } } })],
    ["a fetch that throws at once", () => { throw new Error("sync"); }],
    ["a fetch that rejects with a non-error", () => Promise.reject(new Error("x"))],
  ])("keeps the batch and retries after %s", async (_label, answer) => {
    const world = createWorld();
    const tab = grantedTab(world, { fetch: answer as never, random: () => 1 });
    trackMany(tab, 1);
    await expect(tab.tracker.flush()).resolves.toBeUndefined();
    expect(world.local.peek(QUEUE_KEY)).not.toBeNull();
    expect(world.clock.pendingTimers()).toBe(1);
  });
});

describe("leaving the page", () => {
  it("sends what is queued by beacon, with the key in the body and none in the URL", async () => {
    const tab = grantedTab(createWorld());
    trackMany(tab, 3);
    tab.page.hide();
    await settle();
    const [request] = tab.world.collector.requests;
    expect(tab.world.collector.requests).toHaveLength(1);
    expect(request?.via).toBe("beacon");
    expect(request?.url).toBe(ENDPOINT);
    expect(JSON.parse(request?.body ?? "{}")).toMatchObject({ writeKey: WRITE_KEY });
    expect(tab.world.collector.deliveredEvents()).toHaveLength(3);
    expect(tab.world.local.peek(QUEUE_KEY)).toBeNull();
    clean(tab);
  });

  it("falls back to a keepalive fetch when the browser refuses the beacon", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.beaconAccepts = false;
    trackMany(tab, 2);
    tab.page.hide();
    await settle();
    const [request] = tab.world.collector.requests;
    expect(request?.via).toBe("fetch");
    expect(request?.keepalive).toBe(true);
    expect(request?.headers["X-Idg-Write-Key"]).toBe(WRITE_KEY);
    expect(request?.body).not.toContain(WRITE_KEY);
    expect(tab.world.collector.deliveredEvents()).toHaveLength(2);
    clean(tab);
  });

  it("falls back to a keepalive fetch when there is no sendBeacon", async () => {
    const tab = grantedTab(createWorld(), { sendBeacon: null });
    trackMany(tab, 1);
    tab.page.hide();
    await settle();
    expect(tab.world.collector.requests[0]?.keepalive).toBe(true);
  });

  it("splits what it sends by beacon at the payload cap too", async () => {
    const tab = grantedTab(createWorld(), { maxPayloadBytes: 1024, maxBatchSize: 100 });
    for (let index = 0; index < 12; index += 1) tab.tracker.track("clicked", { target: "x".repeat(200) });
    tab.page.hide();
    await settle();
    const beacons = tab.world.collector.requests.filter((request) => request.via === "beacon");
    expect(beacons.length).toBeGreaterThan(1);
    for (const request of beacons) expect(request.bytes).toBeLessThanOrEqual(1024);
    expect(tab.world.collector.deliveredEvents()).toHaveLength(12);
    clean(tab);
  });

  it("sends nothing when nothing is queued", async () => {
    const tab = grantedTab(createWorld());
    tab.page.hide();
    await settle();
    expect(tab.world.collector.requests).toEqual([]);
  });

  it("starts no second request when one is in flight, and keeps the events stored", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer("hang");
    trackMany(tab, 1);
    void tab.tracker.flush();
    await settle();
    tab.tracker.track("clicked", { target: "second" });
    tab.page.hide();
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    expect(tab.world.local.peek(QUEUE_KEY)).toContain("second");
    tab.world.collector.releaseHanging();
  });

  it("does not send while offline, and leaves the events stored", async () => {
    const tab = grantedTab(createWorld());
    trackMany(tab, 1);
    tab.page.goOffline();
    tab.page.hide();
    await settle();
    expect(tab.world.collector.requests).toEqual([]);
    expect(tab.world.local.peek(QUEUE_KEY)).not.toBeNull();
  });
});

describe("offline", () => {
  it("holds events while offline and sends them when the browser is back online", async () => {
    const tab = grantedTab(createWorld());
    tab.page.goOffline();
    trackMany(tab, 3);
    tab.world.clock.advance(60 * SECOND);
    await tab.tracker.flush();
    expect(tab.world.collector.requests).toEqual([]);
    expect(tab.world.local.peek(QUEUE_KEY)).not.toBeNull();
    tab.page.goOnline();
    await settle();
    expect(tab.world.collector.deliveredEvents()).toHaveLength(3);
    expect(tab.world.local.peek(QUEUE_KEY)).toBeNull();
    clean(tab);
  });

  it("does not poll while offline", async () => {
    const tab = grantedTab(createWorld());
    tab.page.goOffline();
    trackMany(tab, 1);
    tab.world.clock.advance(5 * SECOND);
    await settle();
    expect(tab.world.clock.pendingTimers()).toBe(0);
  });
});

describe("dispose", () => {
  it("removes every listener and timer, and is idempotent", () => {
    const tab = grantedTab(createWorld(), { autoPageViews: true });
    trackMany(tab, 2);
    expect(tab.page.listenerCount()).toBeGreaterThan(0);
    expect(tab.world.hub.listenerCount()).toBe(1);
    tab.tracker.dispose();
    tab.tracker.dispose();
    expect(tab.page.listenerCount()).toBe(0);
    expect(tab.world.hub.listenerCount()).toBe(0);
    expect(tab.world.clock.pendingTimers()).toBe(0);
  });

  it("makes every method a no-op", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    tab.tracker.dispose();
    const calls = world.local.calls.length;
    const sessionCalls = tab.session.calls.length;
    tab.tracker.track("logout");
    tab.tracker.page();
    tab.tracker.identify("x");
    await tab.tracker.flush();
    expect(tab.tracker.consent.deny()).toBe(false);
    expect(tab.tracker.consent.grant()).toBe(false);
    expect(tab.tracker.consent.reset()).toBe(false);
    tab.tracker.consent.onChange(() => undefined)();
    expect(tab.tracker.consent.get()).toEqual({ state: "granted" });
    tab.page.hide();
    world.clock.advance(3600 * SECOND);
    await settle();
    expect(world.collector.requests).toEqual([]);
    expect(world.local.calls.length).toBe(calls);
    expect(tab.session.calls.length).toBe(sessionCalls);
  });

  it("lets an in-flight request finish without touching storage or timers", async () => {
    const world = createWorld();
    const tab = grantedTab(world);
    world.collector.answer("hang");
    trackMany(tab, 1);
    const flushed = tab.tracker.flush();
    await settle();
    tab.tracker.dispose();
    const calls = world.local.calls.length;
    world.collector.releaseHanging({ status: 500 });
    await flushed;
    expect(world.local.calls.length).toBe(calls);
    expect(world.clock.pendingTimers()).toBe(0);
  });

  it("keeps the offline queue, which is not a revocation", () => {
    const tab = grantedTab(createWorld());
    trackMany(tab, 1);
    tab.tracker.dispose();
    expect(tab.world.local.peek(QUEUE_KEY)).not.toBeNull();
  });
});
