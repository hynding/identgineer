/**
 * The text of idg-event-table. Override any of it through `labels`; the placeholders in braces are
 * filled in where a default has them.
 */
export interface EventTableLabels {
  readonly columnName: string;
  readonly columnTime: string;
  readonly columnPath: string;
  readonly columnProperties: string;
  /** In the path cell of an event that has none, for a screen reader beside the dash. */
  readonly noPath: string;
  /** In the properties cell of an event that has none. */
  readonly noProperties: string;
  /** After the properties that are shown, when there are more: `{count}`. */
  readonly moreProperties: string;
  /** Shown, and said politely, while the events load. */
  readonly loading: string;
  readonly empty: string;
  /** Said politely whenever the page changes: `{from}`, `{to}` and `{total}`. */
  readonly summary: string;
  /** Said politely after a sort: `{column}` and `{direction}`. */
  readonly sortStatus: string;
  readonly sortAscending: string;
  readonly sortDescending: string;
  /** The accessible name of the pagination landmark. */
  readonly paginationLabel: string;
  readonly previousPage: string;
  readonly nextPage: string;
  /** The accessible name of a page control: `{page}`. */
  readonly page: string;
}

export const EVENT_TABLE_LABELS: EventTableLabels = {
  columnName: "Event",
  columnTime: "Time",
  columnPath: "Path",
  columnProperties: "Properties",
  noPath: "No path",
  noProperties: "No properties",
  moreProperties: "+{count} more",
  loading: "Loading events",
  empty: "No events yet.",
  summary: "Showing {from}–{to} of {total} events",
  sortStatus: "Sorted by {column}, {direction}",
  sortAscending: "ascending",
  sortDescending: "descending",
  paginationLabel: "Event pages",
  previousPage: "Previous page",
  nextPage: "Next page",
  page: "Page {page}",
};
