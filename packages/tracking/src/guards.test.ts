import { describe, expect, it } from "vitest";
import {
  CONSENT_KEY,
  QUEUE_KEY,
  changesSince,
  createWorld,
  grantedTab,
  settle,
} from "./test-harness.ts";

const HOUR = 3_600_000;

// Each test below fails if one specific guard in the delivery path is removed.
describe("guards on the delivery path", () => {
  it("a signal raised without any API call stops the beacon sent when the page is hidden", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.track("clicked", { target: "a" });
    tab.page.setGpc(true);
    tab.page.hide();
    await settle();
    expect(tab.world.collector.requests).toEqual([]);
    expect(tab.world.local.keys()).toEqual([CONSENT_KEY]);
  });

  it("a signal raised during a request keeps the answer from writing the queue back", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer("hang");
    tab.tracker.track("clicked", { target: "a" });
    const flushed = tab.tracker.flush();
    await settle();
    tab.tracker.track("clicked", { target: "b" });
    tab.page.setDnt("1");
    const calls = tab.world.local.calls.length;
    tab.world.collector.releaseHanging({ status: 202 });
    await flushed;
    // The key ends up removed either way; what matters is that it was never written again.
    expect(changesSince(tab.world.local, calls)).not.toContain(`setItem ${QUEUE_KEY}`);
    expect(tab.world.local.keys()).toEqual([CONSENT_KEY]);
  });

  describe("an answer to a request sent before a revocation", () => {
    const afterRevocation = async (status: number) => {
      const tab = grantedTab(createWorld(), { random: () => 1 });
      tab.world.collector.answer("hang");
      tab.tracker.track("clicked", { target: "old" });
      const flushed = tab.tracker.flush();
      await settle();
      tab.tracker.consent.deny();
      tab.tracker.consent.grant();
      tab.tracker.track("clicked", { target: "new" });
      tab.world.collector.releaseHanging({ status });
      await flushed;
      await settle();
      return tab;
    };

    it("a 5xx starts no backoff for what came after", async () => {
      const tab = await afterRevocation(500);
      tab.world.clock.advance(4999);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(1);
      tab.world.clock.advance(1);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(2);
    });

    it("a 2xx does not send what came after before its interval", async () => {
      const tab = await afterRevocation(202);
      expect(tab.world.collector.requests).toHaveLength(1);
      tab.world.clock.advance(5000);
      await settle();
      expect(tab.world.collector.requests).toHaveLength(2);
    });
  });

  it("an event that ages past 24 hours during a long backoff is dropped, not sent", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.setDefault({ status: 503 });
    tab.tracker.track("clicked", { target: "old" });
    await tab.tracker.flush();
    for (let step = 0; step < 300; step += 1) {
      tab.world.clock.advance(300_000);
      await settle();
    }
    tab.world.collector.setDefault({ status: 202 });
    tab.world.clock.advance(HOUR);
    await settle();
    expect(tab.world.collector.deliveredEvents()).toEqual([]);
    expect(tab.drops.map((drop) => drop.code)).toContain("expired");
    expect(tab.world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it("hiding the page during a backoff sends nothing", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer({ status: 429, headers: { "Retry-After": "60" } });
    tab.tracker.track("clicked", { target: "a" });
    await tab.tracker.flush();
    tab.tracker.track("clicked", { target: "b" });
    tab.page.hide();
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    expect(tab.world.local.peek(QUEUE_KEY)).toContain("b");
  });
});
