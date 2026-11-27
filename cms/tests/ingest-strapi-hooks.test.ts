import { describe, expect, it, vi } from "vitest";
import purgeTask, { type QueryEngineLike } from "../protected/src/cron/purge-expired-events.ts";
import { purgeExpiredEvents } from "../protected/src/ingest/purge.ts";
import { issueIngestKey, newIngestKey } from "../protected/src/hooks/issue-ingest-key.ts";
import dropClientIngestKey, {
  type WriteContext,
} from "../protected/src/middlewares/drop-client-ingest-key.ts";
import { contentTypeNamed, loadIr } from "./model";

const ingestKeyPattern = new RegExp(
  contentTypeNamed(loadIr(), "Property").fields.find((field) => field.name === "ingestKey")
    ?.pattern ?? "(?!)",
);

describe("IssueIngestKey on Strapi", () => {
  it("issues pk_ and 40 random letters and digits, which Property.ingestKey accepts", () => {
    const key = newIngestKey();
    expect(key).toMatch(/^pk_[A-Za-z0-9]{40}$/);
    expect(ingestKeyPattern.test(key)).toBe(true);
  });

  it("ignores the key the client sent", () => {
    const chosen = "pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const { ingestKey } = issueIngestKey.run({ ingestKey: chosen });
    expect(ingestKey).not.toBe(chosen);
    expect(ingestKeyPattern.test(ingestKey)).toBe(true);
  });

  it("issues a different key each time, spread over the whole alphabet", () => {
    const keys = Array.from({ length: 200 }, () => newIngestKey());
    expect(new Set(keys).size).toBe(200);
    const characters = new Set(keys.join("").replace(/pk_/g, ""));
    expect(characters.size).toBe(62);
  });
});

describe("DropClientIngestKey on Strapi", () => {
  const CHOSEN = `pk_${"A".repeat(40)}`;

  /** Runs the middleware on a body and returns the body the next step (the controller) reads. */
  const passOn = async (body: unknown): Promise<unknown> => {
    const context: WriteContext = { request: { body } };
    let seen: unknown = "not called";
    await dropClientIngestKey()(context, () => {
      seen = context.request.body;
      return Promise.resolve();
    });
    return seen;
  };

  it("takes a client's key out of a create's or an update's data, keeping every other field", async () => {
    expect(await passOn({ data: { name: "Shop", ingestKey: CHOSEN }, extra: 1 })).toEqual({
      data: { name: "Shop" },
      extra: 1,
    });
  });

  it("passes a body without a key, or one it cannot read, on unchanged", async () => {
    for (const body of [
      { data: { name: "Shop" } },
      { data: "not json" },
      { data: null },
      undefined,
    ]) {
      expect(await passOn(body)).toEqual(body);
    }
  });

  it("drops a key sent as null or under an own __proto__ key too", async () => {
    expect(await passOn({ data: { name: "Shop", ingestKey: null } })).toEqual({
      data: { name: "Shop" },
    });
    const parsed = JSON.parse(`{"data":{"__proto__":{"x":1},"ingestKey":"${CHOSEN}"}}`) as unknown;
    const body = (await passOn(parsed)) as { data: Record<string, unknown> };
    expect(Object.prototype.hasOwnProperty.call(body.data, "ingestKey")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body.data, "__proto__")).toBe(true);
  });
});

describe("PurgeExpiredEvents on Strapi", () => {
  it("deletes each property's events older than its retentionDays", async () => {
    const now = Date.parse("2026-03-10T12:00:00.000Z");
    vi.useFakeTimers({ now });
    const deletes: Record<string, unknown>[] = [];
    const strapi: QueryEngineLike = {
      db: {
        query: (uid) => ({
          findMany: () => {
            expect(uid).toBe("api::property.property");
            return Promise.resolve([
              { id: 1, retentionDays: 1 },
              { id: 2, retentionDays: 180 },
            ]);
          },
          deleteMany: (params) => {
            expect(uid).toBe("api::event.event");
            deletes.push(params);
            return Promise.resolve({ count: 1 });
          },
        }),
      },
    };
    try {
      await purgeTask({ strapi });
    } finally {
      vi.useRealTimers();
    }
    expect(deletes).toHaveLength(2);
    const cutoffs = deletes.map((params) => {
      const where = params.where as { property: { id: number }; occurredAt: { $lt: string } };
      return [where.property.id, now - Date.parse(where.occurredAt.$lt)];
    });
    const day = 86_400_000;
    expect(cutoffs[0]?.[0]).toBe(1);
    expect(cutoffs[0]?.[1]).toBe(day);
    expect(cutoffs[1]?.[0]).toBe(2);
    expect(cutoffs[1]?.[1]).toBe(180 * day);
  });

  it("deletes nothing of a property whose retentionDays is below 1 or not a whole number", async () => {
    const deleted: number[] = [];
    await purgeExpiredEvents({
      properties: () =>
        Promise.resolve([
          { id: 1, retentionDays: 0 },
          { id: 2, retentionDays: -5 },
          { id: 3, retentionDays: 1.5 },
          { id: 4, retentionDays: Number.NaN },
          { id: 5, retentionDays: 30 },
        ]),
      deleteEventsBefore: (propertyId) => {
        deleted.push(propertyId);
        return Promise.resolve(0);
      },
      now: () => Date.parse("2026-03-10T12:00:00.000Z"),
    });
    expect(deleted).toEqual([5]);
  });
});
