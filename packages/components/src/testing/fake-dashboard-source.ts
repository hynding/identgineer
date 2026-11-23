import {
  DashboardError,
  type DashboardSource,
  type EventPage,
  type EventQuery,
  type StatMetric,
  type StatRange,
  type StatSummary,
  type TrackedEvent,
  type TrackedProperty,
} from "../dashboard/dashboard-types";
import { sortEvents } from "../components/event-table/event-table-model";

type Method = "listProperties" | "listEvents" | "summary";

export interface FakeCall {
  readonly method: Method;
  readonly args: readonly unknown[];
}

export interface FakeDashboardOptions {
  /** The properties the signed-in user owns. */
  readonly properties: readonly TrackedProperty[];
  /**
   * Events by property id. An id that is not among `properties` is someone else's: its events are
   * kept here so a test can prove they never come out.
   */
  readonly events?: Readonly<Record<string, readonly TrackedEvent[]>>;
  /** Summaries to answer with, by property id and range; others are made up, the same each time. */
  readonly summaries?: Readonly<Record<string, Partial<Record<StatRange, StatSummary>>>>;
}

const RANGE_POINTS: Readonly<Record<StatRange, number>> = { "24h": 24, "7d": 7, "30d": 30 };

// Not-found says nothing about whether the id exists, so a user cannot find out what others own.
const notFound = () => new DashboardError("not-found", "property not found");

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) {
    value = Math.imul(value ^ (character.codePointAt(0) ?? 0), 16777619) >>> 0;
  }
  return value;
}

function metric(seed: number, points: number, scale: number): StatMetric {
  const series = Array.from({ length: points }, (_, index) => {
    const wave = Math.sin((index + (seed % 7)) / 2) * scale * 0.3;
    return Math.round(scale + wave + ((seed >>> (index % 16)) % Math.max(scale / 4, 1)));
  });
  const value = series.reduce((sum, item) => sum + item, 0);
  return { value, previous: Math.round(value * (0.8 + (seed % 40) / 100)), series };
}

function madeUpSummary(propertyId: string, range: StatRange): StatSummary {
  const seed = hash(`${propertyId}:${range}`);
  const points = RANGE_POINTS[range];
  const scale = 20 + (hash(propertyId) % 80);
  return {
    propertyId,
    range,
    visitors: metric(seed, points, scale),
    pageViews: metric(seed + 1, points, scale * 3),
    events: metric(seed + 2, points, scale * 2),
  };
}

/**
 * A dashboard source for tests and fixtures: the user owns `properties` and nothing else, an id
 * that is not theirs is refused as one that does not exist, answers are copies, and what was
 * asked is recorded. A test can fail the next call, or hold every answer back until it releases
 * them, to see a page while it loads.
 */
export function createFakeDashboardSource(options: FakeDashboardOptions) {
  const owned = new Set(options.properties.map((property) => property.id));
  const calls: FakeCall[] = [];
  const failures = new Map<Method, DashboardError[]>();
  let gate: Promise<void> | undefined;

  const enter = async (method: Method, args: readonly unknown[]): Promise<void> => {
    calls.push({ method, args });
    await gate;
    const failure = failures.get(method)?.shift();
    if (failure) throw failure;
  };
  const own = (propertyId: string): void => {
    if (!owned.has(propertyId)) throw notFound();
  };

  const source: DashboardSource = {
    listProperties: async () => {
      await enter("listProperties", []);
      return structuredClone([...options.properties]);
    },

    listEvents: async (propertyId: string, query: EventQuery): Promise<EventPage> => {
      await enter("listEvents", [propertyId, query]);
      own(propertyId);
      const all = options.events?.[propertyId] ?? [];
      const sort = query.sort ?? { key: "time", direction: "descending" };
      const ordered = sortEvents(all, sort.key, sort.direction, undefined);
      const start = (query.page - 1) * query.pageSize;
      return structuredClone({
        events: ordered.slice(start, start + query.pageSize),
        total: all.length,
      });
    },

    summary: async (propertyId: string, range: StatRange): Promise<StatSummary> => {
      await enter("summary", [propertyId, range]);
      own(propertyId);
      return structuredClone(
        options.summaries?.[propertyId]?.[range] ?? madeUpSummary(propertyId, range),
      );
    },
  };

  return {
    source,
    calls,
    /** The next call of `method` rejects with `error`, once. */
    failNext(method: Method, error: DashboardError): void {
      failures.set(method, [...(failures.get(method) ?? []), error]);
    },
    /** Every call waits until the function this returns is called. */
    hold(): () => void {
      let release = () => {};
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = undefined;
          resolve();
        };
      });
      return release;
    },
  };
}

export type FakeDashboardSource = ReturnType<typeof createFakeDashboardSource>;
