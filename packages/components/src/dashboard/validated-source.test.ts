import { describe, expect, it } from "vitest";
import { DashboardError, type DashboardSource } from "./dashboard-types";
import { validatedSource } from "./validated-source";

const METRIC = { value: 3, series: [1, 2] };
const GOOD_SUMMARY = {
  propertyId: "p1",
  range: "7d",
  visitors: METRIC,
  pageViews: METRIC,
  events: METRIC,
};
const QUERY = { page: 1, pageSize: 10 } as const;

/** A source that answers with whatever it is given, as a server that went wrong would. */
function sourceAnswering(answers: {
  properties?: unknown;
  events?: unknown;
  summary?: unknown;
}): DashboardSource {
  return {
    listProperties: () => Promise.resolve(answers.properties as never),
    listEvents: () => Promise.resolve(answers.events as never),
    summary: () => Promise.resolve(answers.summary as never),
  };
}

describe("validatedSource", () => {
  it("passes on what is well formed, with the properties and events cleaned", async () => {
    const source = validatedSource(
      sourceAnswering({
        properties: [{ id: "p1", name: "Docs", extra: 1 }, { id: "bad" }],
        events: {
          events: [{ id: "e1", name: "x", occurredAt: "2026-03-01T00:00:00Z" }, null],
          total: 40,
        },
        summary: GOOD_SUMMARY,
      }),
    );
    expect(await source.listProperties()).toEqual([{ id: "p1", name: "Docs" }]);
    expect(await source.listEvents("p1", QUERY)).toEqual({
      events: [{ id: "e1", name: "x", occurredAt: "2026-03-01T00:00:00.000Z" }],
      total: 40,
    });
    expect(await source.summary("p1", "7d")).toEqual(GOOD_SUMMARY);
  });

  it("rejects, with a located error, a response that cannot be used", async () => {
    const source = validatedSource(sourceAnswering({ properties: "nope", events: 5, summary: {} }));
    await expect(source.listProperties()).rejects.toMatchObject({
      name: "DashboardError",
      code: "invalid-response",
      message: expect.stringContaining("listProperties") as unknown,
    });
    await expect(source.listEvents("p1", QUERY)).rejects.toMatchObject({
      code: "invalid-response",
      message: expect.stringContaining("listEvents") as unknown,
    });
    await expect(source.summary("p1", "7d")).rejects.toMatchObject({
      code: "invalid-response",
      message: expect.stringContaining("summary") as unknown,
    });
  });

  it("rejects a summary for another property or another range than the one asked for", async () => {
    const source = validatedSource(sourceAnswering({ summary: GOOD_SUMMARY }));
    await expect(source.summary("p2", "7d")).rejects.toMatchObject({ code: "invalid-response" });
    await expect(source.summary("p1", "30d")).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("lets a DashboardError through as it was, since the server's reason is the page's to act on", async () => {
    const error = new DashboardError("unauthenticated", "signed out");
    const source = validatedSource({
      listProperties: () => Promise.reject(error),
      listEvents: () => Promise.reject(error),
      summary: () => Promise.reject(error),
    });
    await expect(source.listProperties()).rejects.toBe(error);
    await expect(source.listEvents("p1", QUERY)).rejects.toBe(error);
    await expect(source.summary("p1", "7d")).rejects.toBe(error);
  });

  it("turns any other failure into an unavailable error, without its message", async () => {
    const source = validatedSource({
      listProperties: () => Promise.reject(new TypeError("token abc123 expired")),
      listEvents: () => {
        throw new Error("sync throw with a secret");
      },
      summary: () => Promise.reject(new RangeError("another kind of error")),
    });
    for (const call of [
      source.listProperties(),
      source.listEvents("p1", QUERY),
      source.summary("p1", "7d"),
    ]) {
      await expect(call).rejects.toMatchObject({ code: "unavailable" });
      await call.catch((error: unknown) => {
        expect((error as Error).message).not.toMatch(/abc123|secret/);
      });
    }
  });

  it("refuses to ask for a page or a page size that makes no sense, without calling the source", async () => {
    let calls = 0;
    const source = validatedSource({
      listProperties: () => Promise.resolve([]),
      listEvents: () => {
        calls += 1;
        return Promise.resolve({ events: [], total: 0 });
      },
      summary: () => Promise.reject(new Error("unused")),
    });
    for (const query of [
      { page: 0, pageSize: 10 },
      { page: 1.5, pageSize: 10 },
      { page: 1, pageSize: 0 },
      { page: 1, pageSize: 1000 },
      { page: Number.NaN, pageSize: 10 },
      { page: 1, pageSize: 10, sort: { key: "path", direction: "ascending" } },
    ]) {
      await expect(source.listEvents("p1", query as never)).rejects.toMatchObject({
        code: "invalid-request",
      });
    }
    await expect(source.listEvents("", QUERY)).rejects.toMatchObject({ code: "invalid-request" });
    expect(calls).toBe(0);
  });

  it.each([
    ["no query", undefined],
    ["a null query", null],
    ["a query that is a string", "page=1"],
    ["a null sort", { page: 1, pageSize: 10, sort: null }],
    ["a sort that is a number", { page: 1, pageSize: 10, sort: 3 }],
  ])("rejects %s with invalid-request, and does not throw", async (_label, query) => {
    const source = validatedSource(sourceAnswering({ events: { events: [], total: 0 } }));
    let call: Promise<unknown> | undefined;
    expect(() => {
      call = source.listEvents("p1", query as never);
    }).not.toThrow();
    await expect(call).rejects.toMatchObject({ code: "invalid-request" });
  });
});
