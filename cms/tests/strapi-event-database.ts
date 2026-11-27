import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { EventTables } from "../protected/src/summary/summary-sql.ts";

// Strapi 5's event tables on sqlite, as Strapi creates them for this model (an events table and the
// property relation's link table), behind the part of knex the summary uses: `raw`, binding as
// knex's better-sqlite3 client does (a Date as its epoch milliseconds, which is also how Strapi
// stores a datetime on sqlite) and answering the rows as an array.

export const STRAPI_EVENT_TABLES: EventTables = {
  table: "events",
  occurredAt: "occurred_at",
  name: "name",
  sessionId: "session_id",
  link: { table: "events_property_lnk", eventColumn: "event_id", propertyColumn: "property_id" },
};

export interface StoredEvent {
  readonly propertyRowId: number;
  readonly name: string;
  readonly occurredAt: string;
  readonly sessionId: string | null;
}

const bind = (value: unknown): SQLInputValue => {
  if (value instanceof Date) return value.valueOf();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number" || value === null) return value;
  throw new Error(`unexpected binding ${typeof value}`);
};

export function strapiEventDatabase(events: readonly StoredEvent[]) {
  const database = new DatabaseSync(":memory:");
  database.exec(
    "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT, name TEXT, " +
      "dedupe_key TEXT, occurred_at INTEGER, session_id TEXT); " +
      "CREATE TABLE events_property_lnk (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, property_id INTEGER);",
  );
  const insertEvent = database.prepare(
    "INSERT INTO events (document_id, name, dedupe_key, occurred_at, session_id) VALUES (?, ?, ?, ?, ?)",
  );
  const insertLink = database.prepare(
    "INSERT INTO events_property_lnk (event_id, property_id) VALUES (?, ?)",
  );
  events.forEach((event, index) => {
    const { lastInsertRowid } = insertEvent.run(
      `event${String(index).padStart(20, "0")}`,
      event.name,
      String(index).padStart(64, "0"),
      Date.parse(event.occurredAt),
      event.sessionId,
    );
    insertLink.run(lastInsertRowid, event.propertyRowId);
  });
  const statements: { sql: string; bindings: readonly unknown[] }[] = [];
  const connection = {
    raw(sql: string, bindings: readonly unknown[]): Promise<unknown[]> {
      statements.push({ sql, bindings });
      try {
        return Promise.resolve(database.prepare(sql).all(...bindings.map(bind)));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
  return {
    connection,
    statements,
    close: () => {
      database.close();
    },
  };
}
