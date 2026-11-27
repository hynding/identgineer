import { describe, expect, it } from "vitest";
import purgeTask, { type QueryEngineLike } from "../protected/src/cron/purge-expired-events.ts";
import { issueIngestKey, newIngestKey } from "../protected/src/hooks/issue-ingest-key.ts";
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

describe("PurgeExpiredEvents on Strapi", () => {
  it("deletes each property's events older than its retentionDays", async () => {
    const now = Date.now();
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
    await purgeTask({ strapi });
    expect(deletes).toHaveLength(2);
    const cutoffs = deletes.map((params) => {
      const where = params.where as { property: { id: number }; occurredAt: { $lt: string } };
      return [where.property.id, now - Date.parse(where.occurredAt.$lt)];
    });
    const day = 86_400_000;
    expect(cutoffs[0]?.[0]).toBe(1);
    expect(cutoffs[0]?.[1]).toBeGreaterThanOrEqual(day);
    expect(cutoffs[0]?.[1]).toBeLessThan(day + 5_000);
    expect(cutoffs[1]?.[0]).toBe(2);
    expect(cutoffs[1]?.[1]).toBeGreaterThanOrEqual(180 * day);
  });
});
