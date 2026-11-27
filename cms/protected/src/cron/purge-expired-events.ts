import { purgeExpiredEvents } from "../ingest/purge";

// Ring 2 scheduled task — hand-written, from the seed camis wrote. Strapi runs it on the cron
// schedule "17 3 * * *" (config/cron-tasks.ts): each property's events older than its
// retentionDays are deleted.

/** The part of Strapi's query engine the task uses; restated, as Strapi is not installed here. */
export interface QueryEngineLike {
  db: {
    query(uid: string): {
      findMany(params: Record<string, unknown>): Promise<Record<string, unknown>[]>;
      deleteMany(params: Record<string, unknown>): Promise<{ count: number }>;
    };
  };
}

export default async ({ strapi }: { strapi: QueryEngineLike }): Promise<void> => {
  await purgeExpiredEvents({
    properties: async () =>
      (
        await strapi.db
          .query("api::property.property")
          .findMany({ select: ["id", "retentionDays"] })
      ).flatMap((row) =>
        typeof row.id === "number" && typeof row.retentionDays === "number"
          ? [{ id: row.id, retentionDays: row.retentionDays }]
          : [],
      ),
    deleteEventsBefore: async (propertyId, before) =>
      (
        await strapi.db.query("api::event.event").deleteMany({
          where: { property: { id: propertyId }, occurredAt: { $lt: before.toISOString() } },
        })
      ).count,
    now: () => Date.now(),
  });
};
