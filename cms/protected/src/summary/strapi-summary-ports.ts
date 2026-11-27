import type { OwnedProperty } from "./handle-summary";
import { summaryFigures, type BucketRow, type SummaryFigures } from "./summary-figures";
import { checkedTables, summaryQueries, type EventTables } from "./summary-sql";
import type { SummaryWindow } from "./summary-window";

// The parts of Strapi 5 the summary uses: the document service for the ownership lookup, the
// database metadata for the events' tables and knex (`strapi.db.connection`) for the two counts.
// Restated, not imported: the protected files are type-checked here, where Strapi is not installed.

interface AttributeMeta {
  readonly columnName?: string;
  readonly joinTable?: {
    readonly name: string;
    readonly joinColumn: { readonly name: string };
    readonly inverseJoinColumn: { readonly name: string };
  };
}

export interface SummaryStrapiLike {
  documents(uid: string): {
    findFirst(params: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  };
  readonly db: {
    readonly metadata: {
      get(uid: string): {
        readonly tableName: string;
        readonly attributes: Record<string, AttributeMeta>;
      };
    };
    readonly connection: { raw(sql: string, bindings: readonly unknown[]): PromiseLike<unknown> };
  };
}

/** The property, by document id and owner in one query: a missing one and another's cost alike. */
export const findOwnedPropertyIn =
  (strapi: SummaryStrapiLike) =>
  async (documentId: string, userId: number): Promise<OwnedProperty | undefined> => {
    const row = await strapi.documents("api::property.property").findFirst({
      filters: { documentId: { $eq: documentId }, owner: { id: { $eq: userId } } },
      fields: ["id"],
    });
    return row !== null && typeof row.id === "number" ? { id: row.id } : undefined;
  };

const column = (attributes: Record<string, AttributeMeta>, name: string): string => {
  const attribute = attributes[name];
  if (attribute === undefined || typeof attribute.columnName !== "string") {
    throw new Error(`PropertySummary: Strapi's metadata has no column for Event.${name}`);
  }
  return attribute.columnName;
};

/** The events' table and columns as Strapi named them, read from its metadata once. */
export function eventTablesOf(strapi: SummaryStrapiLike): EventTables {
  const meta = strapi.db.metadata.get("api::event.event");
  const link = meta.attributes.property?.joinTable;
  if (link === undefined) {
    throw new Error("PropertySummary: Strapi's metadata has no link table for Event.property");
  }
  return checkedTables({
    table: meta.tableName,
    occurredAt: column(meta.attributes, "occurredAt"),
    name: column(meta.attributes, "name"),
    sessionId: column(meta.attributes, "sessionId"),
    link: {
      table: link.name,
      eventColumn: link.joinColumn.name,
      propertyColumn: link.inverseJoinColumn.name,
    },
  });
}

/** knex's raw answer as rows: an array on sqlite, `[rows, fields]` on MySQL, `{ rows }` on pg. */
export function rowsOf(result: unknown): BucketRow[] {
  if (Array.isArray(result)) {
    const first: unknown = result[0];
    return (Array.isArray(first) ? first : result) as BucketRow[];
  }
  if (
    typeof result === "object" &&
    result !== null &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: BucketRow[] }).rows;
  }
  throw new Error("PropertySummary: the database answered no rows");
}

export const countEventsIn = (strapi: SummaryStrapiLike) => {
  let tables: EventTables | undefined;
  return async (window: SummaryWindow, propertyRowId: number): Promise<SummaryFigures> => {
    tables = tables ?? eventTablesOf(strapi);
    const queries = summaryQueries(window, tables, propertyRowId);
    const connection = strapi.db.connection;
    const buckets = rowsOf(await connection.raw(queries.buckets.sql, queries.buckets.bindings));
    const visitors = rowsOf(await connection.raw(queries.visitors.sql, queries.visitors.bindings));
    return summaryFigures(window, buckets, visitors[0]);
  };
};
