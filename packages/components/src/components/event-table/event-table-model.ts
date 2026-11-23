import type {
  EventPropertyValue,
  EventSortDirection,
  EventSortKey,
  TrackedEvent,
} from "../../dashboard/dashboard-types";
import { DASHBOARD_LIMITS } from "../../dashboard/parse-dashboard-data";
import { displayText } from "../../utils/untrusted-text";

/** What is drawn of an event, so no record can make a row taller or wider than a page can hold. */
export const EVENT_TABLE_LIMITS = {
  name: 120,
  path: 200,
  propertyKey: 40,
  propertyValue: 120,
  /** Properties shown for one event; the rest are counted. */
  properties: 10,
  pageSize: DASHBOARD_LIMITS.pageSize,
  defaultPageSize: 10,
} as const;

export function normalisePageSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return EVENT_TABLE_LIMITS.defaultPageSize;
  }
  return Math.min(Math.trunc(value), EVENT_TABLE_LIMITS.pageSize);
}

/** How many pages `total` events make, at least one so there is always a page to show. */
export function pageCountOf(total: number, pageSize: number): number {
  return Number.isFinite(total) && total > 0 ? Math.ceil(total / pageSize) : 1;
}

/** The page held to the pages there are, from 1. */
export function normalisePage(page: unknown, pageCount: number): number {
  if (typeof page !== "number" || !Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), Math.max(pageCount, 1));
}

function collator(language: string | undefined): Intl.Collator {
  try {
    return new Intl.Collator(language === "" ? undefined : language, { numeric: true });
  } catch {
    return new Intl.Collator(undefined, { numeric: true });
  }
}

/**
 * The events in the order of `key`, or as given when there is none. Equal events keep the order
 * they came in, whichever way the sort goes. The list passed in is not changed.
 */
export function sortEvents(
  events: readonly TrackedEvent[],
  key: EventSortKey | "",
  direction: EventSortDirection,
  language: string | undefined,
): TrackedEvent[] {
  if (key === "") return [...events];
  const compareNames = collator(language);
  const sign = direction === "ascending" ? 1 : -1;
  const compare = (left: TrackedEvent, right: TrackedEvent): number =>
    key === "time"
      ? Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
      : compareNames.compare(left.name, right.name);
  return events
    .map((item, index) => ({ item, index }))
    .sort((left, right) => sign * compare(left.item, right.item) || left.index - right.index)
    .map(({ item }) => item);
}

export interface ShownProperty {
  readonly key: string;
  readonly value: string;
}

function valueText(value: EventPropertyValue): string {
  return String(value);
}

/**
 * The properties of an event as text to draw: at most a few of them, each cut to a length that
 * fits a cell and neutralised, and how many were left out.
 */
export function displayedProperties(
  properties: Readonly<Record<string, EventPropertyValue>> | undefined,
): { entries: ShownProperty[]; hidden: number } {
  const all = properties === undefined ? [] : Object.entries(properties);
  return {
    entries: all.slice(0, EVENT_TABLE_LIMITS.properties).map(([key, value]) => ({
      key: displayText(key, EVENT_TABLE_LIMITS.propertyKey),
      value: displayText(valueText(value), EVENT_TABLE_LIMITS.propertyValue),
    })),
    hidden: Math.max(all.length - EVENT_TABLE_LIMITS.properties, 0),
  };
}
