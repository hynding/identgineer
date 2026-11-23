/**
 * The seam between the dashboard components and the authenticated API that feeds them. The
 * components never fetch: the page asks a `DashboardSource` and hands the answers to them as
 * properties. These types are the contract the server task implements, so every name is neutral
 * and says nothing about how the data travels.
 *
 * Ownership is the source's to enforce: a source only ever answers for the properties the signed-in
 * user owns, and answers for any other id as it would for one that does not exist.
 */

/** A property (a site) the user tracks. Its name and origin are text the user typed. */
export interface TrackedProperty {
  readonly id: string;
  readonly name: string;
  /** The `https://host` the property is served from, when it has one. */
  readonly origin?: string;
}

/** What a tracked event may carry as a property value. */
export type EventPropertyValue = string | number | boolean | null;

/**
 * An event that was collected from a page on the public internet. Every string in it is
 * untrusted: the components show it as text and nothing else.
 */
export interface TrackedEvent {
  readonly id: string;
  readonly name: string;
  /** ISO 8601 in UTC, such as `2026-03-01T12:30:00.000Z`. */
  readonly occurredAt: string;
  readonly path?: string;
  readonly properties?: Readonly<Record<string, EventPropertyValue>>;
}

export const EVENT_SORT_KEYS = ["time", "name"] as const;
export type EventSortKey = (typeof EVENT_SORT_KEYS)[number];

export type EventSortDirection = "ascending" | "descending";

export interface EventSort {
  readonly key: EventSortKey;
  readonly direction: EventSortDirection;
}

export interface EventQuery {
  /** From 1. */
  readonly page: number;
  readonly pageSize: number;
  /** Newest first when left out. */
  readonly sort?: EventSort;
}

/** One page of events, and how many there are in all. */
export interface EventPage {
  readonly events: readonly TrackedEvent[];
  readonly total: number;
}

export const STAT_RANGES = ["24h", "7d", "30d"] as const;
export type StatRange = (typeof STAT_RANGES)[number];

/** One figure over a range: its value, the value over the range before it, and a series to draw. */
export interface StatMetric {
  readonly value: number;
  readonly previous?: number;
  readonly series: readonly number[];
}

export interface StatSummary {
  readonly propertyId: string;
  readonly range: StatRange;
  readonly visitors: StatMetric;
  readonly pageViews: StatMetric;
  readonly events: StatMetric;
}

export type DashboardErrorCode =
  | "unauthenticated"
  /** The id is not one of the user's properties. Said the same as "not-found", on purpose. */
  | "forbidden"
  | "not-found"
  | "unavailable"
  | "invalid-response";

/** Why a source could not answer. The message is for a developer, not for the page to show. */
export class DashboardError extends Error {
  readonly code: DashboardErrorCode;

  constructor(code: DashboardErrorCode, message: string) {
    super(message);
    this.name = "DashboardError";
    this.code = code;
  }
}

/**
 * What the dashboard reads, through the authenticated API. Every call is for the signed-in user.
 * A call for a property the user does not own rejects with a `DashboardError`, whose code is the
 * same as for a property that does not exist.
 */
export interface DashboardSource {
  listProperties: () => Promise<readonly TrackedProperty[]>;
  listEvents: (propertyId: string, query: EventQuery) => Promise<EventPage>;
  summary: (propertyId: string, range: StatRange) => Promise<StatSummary>;
}
