import { describe, expect, it } from "vitest";
import { QUEUE_KEY, createWorld, grantedTab, settle } from "./test-harness.ts";

const idsOf = (body: string | undefined): string[] =>
  (JSON.parse(body ?? '{"events":[]}') as { events: { id: string }[] }).events.map(
    (event) => event.id,
  );

// One fetch is in flight, holding the first event; the page is hidden with more queued.
const hiddenDuringRequest = async (options: { beaconAccepts?: boolean } = {}) => {
  const tab = grantedTab(createWorld(), { random: () => 1 });
  const { collector } = tab.world;
  collector.beaconAccepts = options.beaconAccepts ?? true;
  collector.answer("hang");
  tab.tracker.track("clicked", { target: "in-flight" });
  const flushed = tab.tracker.flush();
  await settle();
  tab.tracker.track("clicked", { target: "queued-1" });
  tab.tracker.track("clicked", { target: "queued-2" });
  tab.page.hide();
  await settle();
  return { tab, flushed };
};

describe("hiding the page while a request is in flight", () => {
  it("beacons the events that are not in the request, and never a second fetch", async () => {
    const { tab } = await hiddenDuringRequest();
    const { collector } = tab.world;
    expect(collector.requests.map((request) => request.via)).toEqual(["fetch", "beacon"]);
    const inFlightIds = idsOf(collector.requests[0]?.body);
    const beaconIds = idsOf(collector.requests[1]?.body);
    expect(inFlightIds).toHaveLength(1);
    expect(beaconIds).toHaveLength(2);
    expect(beaconIds.some((id) => inFlightIds.includes(id))).toBe(false);
    expect(collector.maxInFlight).toBe(1);
    expect(collector.violations).toEqual([]);
  });

  it("counts what the browser took as delivered: stored and sent once, however the request ends", async () => {
    const { tab, flushed } = await hiddenDuringRequest();
    const { collector } = tab.world;
    expect(tab.world.local.peek(QUEUE_KEY)).not.toContain("queued");
    collector.releaseHanging({ status: 500 });
    await flushed;
    await settle();
    tab.world.clock.advance(1000);
    await settle();
    const sent = collector.requests.flatMap((request) => idsOf(request.body));
    expect(new Set(sent).size).toBe(3);
    expect(sent).toHaveLength(4);
    expect(tab.world.local.peek(QUEUE_KEY)).toBeNull();
  });

  it("keeps the events when the browser refuses the beacon, without a fallback fetch", async () => {
    const { tab, flushed } = await hiddenDuringRequest({ beaconAccepts: false });
    const { collector } = tab.world;
    expect(collector.requests).toHaveLength(1);
    expect(JSON.parse(tab.world.local.peek(QUEUE_KEY) ?? "null")).toMatchObject({
      events: [{}, {}, {}],
    });
    collector.releaseHanging({ status: 202 });
    await flushed;
    await settle();
    expect(collector.deliveredEvents().map((event) => event.properties?.target)).toEqual([
      "in-flight",
      "queued-1",
      "queued-2",
    ]);
    expect(collector.maxInFlight).toBe(1);
  });

  it("sends nothing when everything queued is already in the request", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer("hang");
    tab.tracker.track("clicked", { target: "in-flight" });
    void tab.tracker.flush();
    await settle();
    tab.page.hide();
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    tab.world.collector.releaseHanging();
  });

  it("sends nothing while a retry is pending, as the server or the backoff asked", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.answer({ status: 429, headers: { "Retry-After": "60" } });
    tab.tracker.track("clicked", { target: "first" });
    await tab.tracker.flush();
    tab.tracker.track("clicked", { target: "second" });
    tab.page.hide();
    await settle();
    expect(tab.world.collector.requests).toHaveLength(1);
    expect(tab.world.local.peek(QUEUE_KEY)).toContain("second");
  });
});

describe("a batch's transport", () => {
  it("says fetch in a fetch and beacon in a beacon", async () => {
    const tab = grantedTab(createWorld());
    tab.tracker.track("clicked", { target: "a" });
    await tab.tracker.flush();
    tab.tracker.track("clicked", { target: "b" });
    tab.page.hide();
    await settle();
    expect(tab.world.collector.batches().map((batch) => batch.transport)).toEqual([
      "fetch",
      "beacon",
    ]);
  });

  it("says fetch in the keepalive fallback, which sends the key in a header", async () => {
    const tab = grantedTab(createWorld());
    tab.world.collector.beaconAccepts = false;
    tab.tracker.track("clicked", { target: "a" });
    tab.page.hide();
    await settle();
    expect(tab.world.collector.batches().map((batch) => batch.transport)).toEqual(["fetch"]);
  });
});
