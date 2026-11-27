import type { IngestProperty } from "./handle-ingest";
import type { EventRow } from "./normalise";

// The parts of Strapi 5's document service the handler uses. Restated, not imported: the protected
// files are type-checked in this repository, which does not install Strapi.
export interface DocumentServiceLike {
  findFirst(params: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  create(params: { data: Record<string, unknown> }): Promise<unknown>;
}

export interface StrapiLike {
  documents(uid: string): DocumentServiceLike;
}

/** A repeatable component's rows as the document service returns them. */
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : [];

const strings = (list: Record<string, unknown>[], field: string): string[] =>
  list.flatMap((row) => (typeof row[field] === "string" ? [row[field]] : []));

export interface StrapiProperty extends IngestProperty {
  readonly documentId: string;
  readonly ownerDocumentId: string;
}

const propertyOf = (row: Record<string, unknown> | null): StrapiProperty | undefined => {
  if (row === null || typeof row.id !== "number" || typeof row.documentId !== "string") {
    return undefined;
  }
  const owner = row.owner as Record<string, unknown> | null | undefined;
  if (typeof owner?.documentId !== "string") return undefined;
  return {
    id: row.id,
    documentId: row.documentId,
    ownerDocumentId: owner.documentId,
    allowedOrigins: new Set(strings(rows(row.allowedOrigins), "origin")),
    allowedEvents: new Map(
      rows(row.allowedEvents).flatMap((allowed) =>
        typeof allowed.name === "string"
          ? [[allowed.name, new Set(strings(rows(allowed.propertyKeys), "key"))] as const]
          : [],
      ),
    ),
    allowedQueryParams: new Set(strings(rows(row.allowedQueryParams), "name")),
  };
};

/** Looks the key up with its active flag in one query, so an inactive key costs what an unknown one does. */
export const findActivePropertyIn =
  (strapi: StrapiLike) =>
  async (writeKey: string): Promise<StrapiProperty | undefined> =>
    propertyOf(
      await strapi.documents("api::property.property").findFirst({
        filters: { ingestKey: { $eq: writeKey }, active: { $eq: true } },
        fields: ["id", "documentId"],
        populate: {
          owner: { fields: ["documentId"] },
          allowedOrigins: true,
          allowedEvents: { populate: { propertyKeys: true } },
          allowedQueryParams: true,
        },
      }),
    );

/**
 * Stores an event unless one with its dedupeKey is stored. Strapi creates no unique index (camis'
 * strapi target enforces `unique` in its validator, by a read), so the read and the write run under
 * a lock per dedupeKey in this process: race-free in the one process local Strapi runs.
 */
export const storeEventIn = (strapi: StrapiLike) => {
  const pending = new Map<string, Promise<unknown>>();
  const events = () => strapi.documents("api::event.event");
  const storeOnce = async (property: StrapiProperty, row: EventRow) => {
    const existing = await events().findFirst({
      filters: { dedupeKey: { $eq: row.dedupeKey } },
      fields: ["id"],
    });
    if (existing !== null) return "duplicate" as const;
    await events().create({
      data: {
        ...row,
        occurredAt: row.occurredAt.toISOString(),
        property: property.documentId,
        owner: property.ownerDocumentId,
      },
    });
    return "stored" as const;
  };
  return async (property: StrapiProperty, row: EventRow): Promise<"stored" | "duplicate"> => {
    const before = pending.get(row.dedupeKey) ?? Promise.resolve();
    const run = before.then(
      () => storeOnce(property, row),
      () => storeOnce(property, row),
    );
    pending.set(row.dedupeKey, run);
    try {
      return await run;
    } finally {
      if (pending.get(row.dedupeKey) === run) pending.delete(row.dedupeKey);
    }
  };
};
