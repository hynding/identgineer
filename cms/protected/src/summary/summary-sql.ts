import { bucketEdges, type SummaryWindow } from "./summary-window";

/**
 * Where Strapi keeps events, from its database metadata: the events table and the columns the
 * summary reads, and the link table of the `property` relation (Strapi 5 stores a many-to-one
 * relation in a table of its own, `events_property_lnk`).
 */
export interface EventTables {
  readonly table: string;
  readonly occurredAt: string;
  readonly name: string;
  readonly sessionId: string;
  readonly link: {
    readonly table: string;
    readonly eventColumn: string;
    readonly propertyColumn: string;
  };
}

export interface SummaryQuery {
  readonly sql: string;
  /** Times as `Date`s, which knex binds as Strapi stored them on each database. */
  readonly bindings: readonly (string | number | Date)[];
}

// Names Strapi gives its tables and columns; they are written into the SQL unquoted, so anything
// else is refused rather than quoted (no dialect then needs its own quoting).
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

export function checkedTables(tables: EventTables): EventTables {
  const names = [
    tables.table,
    tables.occurredAt,
    tables.name,
    tables.sessionId,
    tables.link.table,
    tables.link.eventColumn,
    tables.link.propertyColumn,
  ];
  for (const name of names) {
    if (typeof name !== "string" || !IDENTIFIER.test(name)) {
      throw new Error("PropertySummary: Strapi's metadata names an unexpected events column");
    }
  }
  return tables;
}

const at = (ms: number): Date => new Date(ms);

/**
 * A session id as its distinct count compares it. Strapi's `mysql` client (MySQL and MariaDB)
 * compares text in the column's collation, which by default folds case, and session ids are
 * base64url, where "aB" and "Ab" are two sessions: there the bytes are compared. sqlite and
 * PostgreSQL compare text byte for byte already, so their SQL is left as it is.
 */
const sessionOf = (column: string, client: string): string =>
  client === "mysql" ? `CAST(${column} AS BINARY)` : column;

/**
 * The two grouped counts that make a summary, over at most twice the range and without loading a
 * row: each bucket's events, page views and distinct sessions (bucket -1 is the range before), and
 * the distinct sessions of each whole range. A bucket is chosen by comparing the time with the
 * buckets' edges (`CASE`), which every database runs alike; no date function is used. The `CASE`
 * is grouped from a derived table by its alias, as PostgreSQL refuses to group by an expression
 * whose parameters are bound twice.
 */
export function summaryQueries(
  window: SummaryWindow,
  tables: EventTables,
  propertyRowId: number,
  client: string,
): { readonly buckets: SummaryQuery; readonly visitors: SummaryQuery } {
  const t = checkedTables(tables);
  const occurredAt = `e.${t.occurredAt}`;
  const session = sessionOf(`e.${t.sessionId}`, client);
  const from =
    `FROM ${t.table} AS e JOIN ${t.link.table} AS l ON l.${t.link.eventColumn} = e.id ` +
    `WHERE l.${t.link.propertyColumn} = ? AND ${occurredAt} >= ? AND ${occurredAt} < ?`;
  const scope = [propertyRowId, at(window.previousStart), at(window.end)];
  const edges = bucketEdges(window);
  const cases = edges.map((_, index) => `WHEN ${occurredAt} < ? THEN ${String(index)}`).join(" ");
  const bucket = `CASE WHEN ${occurredAt} < ? THEN -1 ${cases} ELSE ${String(window.buckets - 1)} END`;
  return {
    buckets: {
      sql:
        "SELECT bucketed.bucket AS bucket, COUNT(*) AS events, " +
        "SUM(CASE WHEN bucketed.name = ? THEN 1 ELSE 0 END) AS page_views, " +
        "COUNT(DISTINCT bucketed.session_id) AS visitors " +
        `FROM (SELECT ${bucket} AS bucket, e.${t.name} AS name, ${session} AS session_id ${from}) AS bucketed ` +
        "GROUP BY bucketed.bucket",
      bindings: ["page_view", at(window.start), ...edges.map(at), ...scope],
    },
    visitors: {
      sql:
        `SELECT COUNT(DISTINCT CASE WHEN ${occurredAt} >= ? THEN ${session} END) AS current_visitors, ` +
        `COUNT(DISTINCT CASE WHEN ${occurredAt} < ? THEN ${session} END) AS previous_visitors ${from}`,
      bindings: [at(window.start), at(window.start), ...scope],
    },
  };
}
