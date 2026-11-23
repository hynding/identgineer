import { describe, expect, it } from "vitest";
import type { FetchInit } from "./fetch-like.ts";
import { createWorld, grantedTab, settle } from "./test-harness.ts";

const track = (tab: ReturnType<typeof grantedTab>, target = "a"): void => {
  tab.tracker.track("clicked", { target });
};

describe("the request timeout", () => {
  it("aborts a request that is not answered in time and retries it after the backoff", async () => {
    const tab = grantedTab(createWorld(), { requestTimeout: 1000, random: () => 1 });
    const { collector, clock } = tab.world;
    collector.answer("hang");
    track(tab);
    void tab.tracker.flush();
    await settle();
    expect(collector.requests[0]?.pending).toBe(true);
    clock.advance(999);
    await settle();
    expect(collector.requests[0]?.pending).toBe(true);
    clock.advance(1);
    await settle();
    expect(collector.requests[0]?.pending).toBe(false);
    expect(collector.inFlight).toBe(0);
    clock.advance(999);
    await settle();
    expect(collector.requests).toHaveLength(1);
    clock.advance(1);
    await settle();
    expect(collector.requests).toHaveLength(2);
    expect(collector.deliveredEvents()).toHaveLength(1);
    expect(collector.violations).toEqual([]);
  });

  it("is 30 seconds unless set", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer("hang");
    track(tab);
    void tab.tracker.flush();
    await settle();
    tab.world.clock.advance(29_999);
    await settle();
    expect(tab.world.collector.requests[0]?.pending).toBe(true);
    tab.world.clock.advance(1);
    await settle();
    expect(tab.world.collector.requests[0]?.pending).toBe(false);
  });

  it("hands the fetch an abort signal that the timeout aborts", async () => {
    const signals: AbortSignal[] = [];
    const tab = grantedTab(createWorld(), {
      requestTimeout: 1000,
      fetch: (_url: string, init: FetchInit) => {
        if (init.signal !== undefined) signals.push(init.signal);
        return new Promise(() => undefined);
      },
    });
    track(tab);
    void tab.tracker.flush();
    await settle();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
    tab.world.clock.advance(1000);
    await settle();
    expect(signals[0]?.aborted).toBe(true);
  });

  it("frees the loop even when the fetch ignores the signal and never answers", async () => {
    let calls = 0;
    const tab = grantedTab(createWorld(), {
      requestTimeout: 1000,
      random: () => 1,
      fetch: () => {
        calls += 1;
        return new Promise(() => undefined);
      },
    });
    track(tab);
    const flushed = tab.tracker.flush();
    await settle();
    tab.world.clock.advance(1000);
    await settle();
    await flushed;
    expect(calls).toBe(1);
    tab.world.clock.advance(1000);
    await settle();
    expect(calls).toBe(2);
  });

  it("leaves no timer behind once the request is answered in time", async () => {
    const tab = grantedTab(createWorld());
    track(tab);
    await tab.tracker.flush();
    await settle();
    expect(tab.world.clock.pendingTimers()).toBe(0);
  });

  it("stops no answer that comes in time", async () => {
    const tab = grantedTab(createWorld(), { requestTimeout: 1000 });
    tab.world.collector.answer("hang");
    track(tab);
    const flushed = tab.tracker.flush();
    await settle();
    tab.world.clock.advance(999);
    tab.world.collector.releaseHanging({ status: 202 });
    await flushed;
    expect(tab.world.collector.deliveredEvents()).toHaveLength(1);
    tab.world.clock.advance(60_000);
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
  });

  it("ignores the answer of a request that timed out, when its fetch answers late", async () => {
    const tab = grantedTab(createWorld(), { requestTimeout: 1000, random: () => 1 });
    tab.world.collector.answer("hang");
    track(tab);
    void tab.tracker.flush();
    await settle();
    tab.world.clock.advance(1000);
    await settle();
    tab.world.collector.releaseHanging({ status: 202 });
    await settle();
    tab.world.clock.advance(1000);
    await settle();
    // The timeout was a failure: the batch went out again, and is delivered once it is answered.
    expect(tab.world.collector.requests).toHaveLength(2);
    expect(tab.world.local.peek("idg.tracking.queue.v1")).toBeNull();
  });
});

describe("the clock moving backwards during a backoff", () => {
  it("waits no longer than the delay chosen, however far back it went", async () => {
    const tab = grantedTab(createWorld(), { random: () => 1 });
    const { collector, clock } = tab.world;
    collector.answer({ status: 429, headers: { "Retry-After": "60" } });
    track(tab);
    await tab.tracker.flush();
    await settle();
    expect(collector.requests).toHaveLength(1);
    clock.jump(-86_400_000);
    track(tab, "b");
    clock.advance(5000);
    await settle();
    clock.advance(60_000);
    await settle();
    expect(collector.requests).toHaveLength(2);
    expect(collector.deliveredEvents()).toHaveLength(2);
  });
});
