import { describe, expect, it } from "vitest";
import { DashboardError, type TrackedEvent } from "../dashboard/dashboard-types";
import { createFakeDashboardSource } from "./fake-dashboard-source";

const event = (id: string, name: string, minute: number): TrackedEvent => ({
  id,
  name,
  occurredAt: new Date(Date.UTC(2026, 2, 1, 12, minute)).toISOString(),
});

const MINE = [
  { id: "p1", name: "Docs" },
  { id: "p2", name: "Shop" },
];
const EVENTS = {
  p1: [event("a", "signup", 1), event("b", "Checkout", 2), event("c", "alpha", 3)],
  p2: [event("d", "other", 4)],
  // Someone else's property, which the signed-in user does not own.
  stranger: [event("z", "secret", 5)],
};

function fake() {
  return createFakeDashboardSource({ properties: MINE, events: EVENTS });
}

describe("createFakeDashboardSource", () => {
  it("lists the properties the user owns, and only those", async () => {
    expect(await fake().source.listProperties()).toEqual(MINE);
  });

  it("lists events newest first by default, and pages them with the total", async () => {
    const { source } = fake();
    const first = await source.listEvents("p1", { page: 1, pageSize: 2 });
    expect(first.events.map((item) => item.id)).toEqual(["c", "b"]);
    expect(first.total).toBe(3);
    const second = await source.listEvents("p1", { page: 2, pageSize: 2 });
    expect(second.events.map((item) => item.id)).toEqual(["a"]);
    expect((await source.listEvents("p1", { page: 9, pageSize: 2 })).events).toEqual([]);
  });

  it("sorts by time or name, either way", async () => {
    const { source } = fake();
    const ids = async (key: "time" | "name", direction: "ascending" | "descending") =>
      (await source.listEvents("p1", { page: 1, pageSize: 10, sort: { key, direction } })).events
        .map((item) => item.id)
        .join("");
    expect(await ids("time", "ascending")).toBe("abc");
    expect(await ids("name", "ascending")).toBe("cba");
    expect(await ids("name", "descending")).toBe("abc");
  });

  it("answers for a property that is not the user's exactly as for one that does not exist", async () => {
    const { source } = fake();
    const refusals = await Promise.all(
      ["stranger", "nobody"].map((id) =>
        source.listEvents(id, { page: 1, pageSize: 10 }).catch((error: unknown) => error),
      ),
    );
    for (const error of refusals) {
      expect(error).toBeInstanceOf(DashboardError);
      expect((error as DashboardError).code).toBe("not-found");
    }
    expect((refusals[0] as Error).message.replace("stranger", "?")).toBe(
      (refusals[1] as Error).message.replace("nobody", "?"),
    );
    await expect(source.summary("stranger", "7d")).rejects.toMatchObject({ code: "not-found" });
  });

  it("never lets a foreign event reach an answer", async () => {
    const { source } = fake();
    const answers = JSON.stringify([
      await source.listProperties(),
      await source.listEvents("p1", { page: 1, pageSize: 100 }),
      await source.listEvents("p2", { page: 1, pageSize: 100 }),
    ]);
    expect(answers).not.toContain("secret");
  });

  it("gives the same summary every time, with a series for each figure", async () => {
    const { source } = fake();
    const first = await source.summary("p1", "7d");
    expect(await source.summary("p1", "7d")).toEqual(first);
    expect(first.propertyId).toBe("p1");
    expect(first.range).toBe("7d");
    expect(first.visitors.series).toHaveLength(7);
    expect((await source.summary("p1", "24h")).visitors.series).toHaveLength(24);
    expect((await source.summary("p1", "30d")).events.series).toHaveLength(30);
    expect((await source.summary("p2", "7d")).visitors.value).not.toBe(first.visitors.value);
  });

  it("uses the summaries a test gives it", async () => {
    const given = {
      propertyId: "p1",
      range: "7d",
      visitors: { value: 1, series: [1] },
      pageViews: { value: 2, series: [2] },
      events: { value: 3, series: [3] },
    } as const;
    const { source } = createFakeDashboardSource({
      properties: MINE,
      summaries: { p1: { "7d": given } },
    });
    expect(await source.summary("p1", "7d")).toEqual(given);
  });

  it("records what was asked", async () => {
    const { source, calls } = fake();
    await source.listProperties();
    await source.listEvents("p1", { page: 2, pageSize: 5 });
    await source.summary("p2", "30d");
    expect(calls).toEqual([
      { method: "listProperties", args: [] },
      { method: "listEvents", args: ["p1", { page: 2, pageSize: 5 }] },
      { method: "summary", args: ["p2", "30d"] },
    ]);
  });

  it("can be told to fail the next call, once, with the error it is given", async () => {
    const { source, failNext } = fake();
    failNext("listProperties", new DashboardError("unavailable", "down"));
    await expect(source.listProperties()).rejects.toMatchObject({ code: "unavailable" });
    expect(await source.listProperties()).toEqual(MINE);
  });

  it("can hold its answers until they are released, to see a page while it loads", async () => {
    const { source, hold } = fake();
    const release = hold();
    let answered = false;
    const pending = source.listProperties().then((list) => {
      answered = true;
      return list;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(answered).toBe(false);
    release();
    expect(await pending).toEqual(MINE);
  });

  it("hands out copies, so a caller that changes an answer changes nothing in the source", async () => {
    const { source } = fake();
    const list = (await source.listProperties()) as { name: string }[];
    (list[0] as { name: string }).name = "changed";
    expect((await source.listProperties())[0]?.name).toBe("Docs");
  });
});
