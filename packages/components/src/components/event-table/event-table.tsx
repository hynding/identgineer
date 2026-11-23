import { Component, Element, Event, h, Prop, type EventEmitter } from "@stencil/core";
import {
  EVENT_SORT_KEYS,
  type EventSort,
  type EventSortDirection,
  type EventSortKey,
  type TrackedEvent,
} from "../../dashboard/dashboard-types";
import { DASHBOARD_LIMITS, parseTrackedEvents } from "../../dashboard/parse-dashboard-data";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { oneOf } from "../../utils/choice";
import { formatDateTime } from "../../utils/format-date-time";
import { numberFormatter } from "../../utils/format-number";
import { languageOf } from "../../utils/language";
import { displayText } from "../../utils/untrusted-text";
import type { PageChangeDetail } from "../pagination/pagination-options";
import { SORT_DIRECTIONS, type TableSortDetail } from "../table/table-options";
import { EVENT_TABLE_LABELS, type EventTableLabels } from "./event-table-labels";
import {
  EVENT_TABLE_LIMITS,
  displayedProperties,
  normalisePage,
  normalisePageSize,
  pageCountOf,
  sortEvents,
} from "./event-table-model";

interface View {
  readonly shown: readonly TrackedEvent[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
  readonly first: number;
}

/**
 * A table of tracked events: the event, when it happened, the path and its properties, with
 * paging and optional sorting by time or name. It takes its data through properties and never
 * fetches.
 *
 * Every value is untrusted text from the public internet. It is drawn as text and nothing else: no
 * markup is read, no link or address is made from it, control and bidirectional characters are
 * replaced by a visible mark, each value is isolated in a `<bdi>` so right to left text cannot
 * reorder what is beside it, long values wrap and are cut to a limit, and an event shows at most
 * ten properties. Records that are malformed are left out.
 *
 * With `events` as the whole list, the table sorts and pages it. With `total` set, `events` is the
 * one page the server answered with: the table draws it as it is and only reports `idgPageChange`
 * and `idgSort` for the page to fetch with. Either way it draws at most `pageSize` rows (to 100).
 * The state that matters is said politely: loading, an error, no events, and which events are shown.
 *
 * @part group - The group that holds everything, named by the caption.
 * @part caption - The caption, drawn here when there is no table to hold it.
 * @part table - The `idg-table` around the table.
 * @part status - The polite region: loading, the error, no events, or which events are shown.
 * @part pagination - The `idg-pagination`.
 */
@Component({
  tag: "idg-event-table",
  styleUrls: ["../../styles/visually-hidden.css", "event-table.css"],
  shadow: true,
})
export class IdgEventTable {
  @Element() host!: HTMLElement;

  /** The events: `{ id, name, occurredAt, path?, properties? }`. Malformed records are left out. */
  @Prop() events?: TrackedEvent[];

  /** The accessible name of the table, drawn as its caption. Required. */
  @Prop() caption?: string;

  /** Draws a skeleton and says the events are loading. */
  @Prop({ reflect: true }) loading = false;

  /** The message of an error that stopped the events loading. Drawn in an alert, as text. */
  @Prop() error?: string;

  /** Rows on a page, 1 to 100. */
  @Prop({ attribute: "page-size" }) pageSize: number = EVENT_TABLE_LIMITS.defaultPageSize;

  /** The current page, from 1. A page beyond the last is drawn as the last. */
  @Prop({ mutable: true, reflect: true }) page = 1;

  /**
   * How many events there are in all. Set it when `events` is one page the server answered with:
   * the table then draws `events` as it is, and neither sorts nor pages it.
   */
  @Prop() total?: number;

  /** Makes the Event and Time headers sort buttons. */
  @Prop({ reflect: true }) sortable = false;

  /** The column the rows are sorted by: `time` or `name`. Empty leaves the order given. */
  @Prop({ mutable: true, reflect: true, attribute: "sort-key" }) sortKey: EventSortKey | "" = "";

  /** The direction of the sort. */
  @Prop({ mutable: true, reflect: true, attribute: "sort-direction" })
  sortDirection: EventSortDirection = "ascending";

  /** The IANA time zone times are shown in, such as `UTC`. The reader's own by default. */
  @Prop({ attribute: "time-zone" }) timeZone?: string;

  /** The words of the table, merged over the English defaults. */
  @Prop() labels?: Partial<EventTableLabels>;

  /**
   * Fires when the user chooses another page, with `{ page }`. Call `preventDefault()` to keep the
   * page where it is, such as to fetch it first and set `page` yourself.
   */
  @Event({ cancelable: true }) idgPageChange!: EventEmitter<PageChangeDetail>;

  /** Fires when the user sorts a column, with `{ key, direction }`. */
  @Event() idgSort!: EventEmitter<EventSort>;

  // Whether the last render settled on rows: only then does a load keep them under it, and only a
  // first load is a skeleton.
  private hadRows = false;
  // Whether focus was in the table or the pager before this render drew.
  private hadFocus = false;

  private parsedFrom?: unknown;
  private parsed: TrackedEvent[] = [];

  // Checked again only when the page gives another list, so a re-render does not walk it again.
  private list(): TrackedEvent[] {
    if (this.parsedFrom !== this.events) {
      this.parsedFrom = this.events;
      this.parsed = parseTrackedEvents(this.events);
    }
    return this.parsed;
  }

  private key(): EventSortKey | "" {
    return oneOf(EVENT_SORT_KEYS, this.sortKey, "");
  }

  private direction(): EventSortDirection {
    return oneOf(SORT_DIRECTIONS, this.sortDirection, "ascending");
  }

  componentWillRender(): void {
    this.hadFocus = this.host.shadowRoot?.activeElement != null;
    this.reconcilePage();
  }

  // A page past the last, or one the events shrank out from under, is brought back to the last
  // page that exists, so the reflected `page` is the one that is drawn. It says nothing: this is
  // the page being corrected, not a choice, and `idgPageChange` is the reader's. Nothing is
  // changed while events are on their way or when none were given, as the total is not known yet.
  private reconcilePage(): void {
    const failed = typeof this.error === "string" && this.error !== "";
    if (this.loading || failed || this.events === undefined) return;
    const { page } = this.view();
    if (this.page !== page) this.page = page;
  }

  componentDidRender(): void {
    const root = this.host.shadowRoot;
    if (!this.hadFocus || !root || root.activeElement) return;
    // What had focus is gone (the rows made way for a message), so focus goes to the message
    // instead of falling to the top of the page.
    root.querySelector<HTMLElement>(".status")?.focus();
  }

  private view(): View {
    const size = normalisePageSize(this.pageSize);
    const all = this.list();
    const stated = this.total;
    const served = typeof stated === "number" && Number.isFinite(stated) && stated >= 0;
    const total = served
      ? Math.min(Math.max(Math.trunc(stated), all.length), DASHBOARD_LIMITS.total)
      : all.length;
    const pageCount = pageCountOf(total, size);
    const page = normalisePage(this.page, pageCount);
    const first = (page - 1) * size;
    const shown = served
      ? all.slice(0, size)
      : sortEvents(all, this.key(), this.direction(), languageOf(this.host)).slice(
          first,
          first + size,
        );
    return { shown, total, page, pageCount, first };
  }

  // While a page is on its way the controls stay where they are, so focus stays on them, and a
  // press asks for nothing more.
  private handlePageChange = (event: CustomEvent<PageChangeDetail>): void => {
    // The pagination's own event stays inside, and its own change is withheld: what the page
    // hears is this element's, and the page this element draws is the one it is told to.
    event.stopPropagation();
    event.preventDefault();
    if (this.loading) return;
    const { page, pageCount } = this.view();
    const target = normalisePage(event.detail.page, pageCount);
    if (target === page) return;
    if (!this.idgPageChange.emit({ page: target }).defaultPrevented) this.page = target;
  };

  private handleSort = (event: CustomEvent<TableSortDetail>): void => {
    event.stopPropagation();
    if (this.loading) return;
    const key = EVENT_SORT_KEYS.find((candidate) => candidate === event.detail.key);
    const direction = SORT_DIRECTIONS.find((candidate) => candidate === event.detail.direction);
    if (key === undefined || direction === undefined) return;
    this.sortKey = key;
    this.sortDirection = direction;
    this.idgSort.emit({ key, direction });
  };

  private renderProperties(event: TrackedEvent, labels: EventTableLabels, format: Format) {
    const { entries, hidden } = displayedProperties(event.properties);
    if (entries.length === 0) {
      return (
        <td class="properties">
          <span aria-hidden="true">—</span>
          <span class="visually-hidden">{labels.noProperties}</span>
        </td>
      );
    }
    return (
      <td class="properties">
        <ul class="props" role="list">
          {entries.map(({ key, value }, index) => (
            <li key={index}>
              <bdi class="key">{key}</bdi>
              {/* Read, so a key and its value are not run together as "planpro". */}
              <span class="separator">: </span>
              <bdi class="value">{value}</bdi>
            </li>
          ))}
          {hidden > 0 ? (
            <li class="more">{fillTemplate(labels.moreProperties, { count: format(hidden) })}</li>
          ) : null}
        </ul>
      </td>
    );
  }

  private renderRow(
    event: TrackedEvent,
    labels: EventTableLabels,
    format: Format,
    language?: string,
  ) {
    return (
      <tr key={event.id}>
        <th scope="row" class="name">
          <bdi>{displayText(event.name, EVENT_TABLE_LIMITS.name)}</bdi>
        </th>
        <td class="time">
          <time dateTime={event.occurredAt}>
            {formatDateTime(event.occurredAt, language, this.timeZone)}
          </time>
        </td>
        <td class="path">
          {event.path === undefined ? (
            [
              <span aria-hidden="true">—</span>,
              <span class="visually-hidden">{labels.noPath}</span>,
            ]
          ) : (
            <bdi>{displayText(event.path, EVENT_TABLE_LIMITS.path)}</bdi>
          )}
        </td>
        {this.renderProperties(event, labels, format)}
      </tr>
    );
  }

  private renderHeader(
    key: EventSortKey | "name" | "time",
    text: string,
    sortable: boolean,
    active: EventSortKey | "",
    direction: EventSortDirection,
  ) {
    const sorted = active === key;
    return (
      <th
        scope="col"
        data-sortable={sortable ? key : undefined}
        aria-sort={sorted ? direction : undefined}
      >
        {text}
      </th>
    );
  }

  private renderTable(view: View, labels: EventTableLabels, format: Format, language?: string) {
    const caption = this.caption ?? "";
    const active = this.key();
    const direction = this.direction();
    return (
      <idg-table
        part="table"
        label={caption}
        manualSort
        sortKey={active}
        sortDirection={direction}
        sortStatus={labels.sortStatus}
        sortAscendingLabel={labels.sortAscending}
        sortDescendingLabel={labels.sortDescending}
        onIdgSort={this.handleSort}
      >
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {this.renderHeader("name", labels.columnName, this.sortable, active, direction)}
              {this.renderHeader("time", labels.columnTime, this.sortable, active, direction)}
              <th scope="col">{labels.columnPath}</th>
              <th scope="col">{labels.columnProperties}</th>
            </tr>
          </thead>
          <tbody>
            {view.shown.map((event) => this.renderRow(event, labels, format, language))}
          </tbody>
        </table>
      </idg-table>
    );
  }

  render() {
    const labels = mergeLabels(EVENT_TABLE_LABELS, this.labels);
    const language = languageOf(this.host);
    const format = numberFormatter(language);
    const view = this.view();
    const failed = typeof this.error === "string" && this.error !== "";
    const empty = view.shown.length === 0;
    const caption = this.caption ?? "";
    const keepsRows = this.loading && this.hadRows && !failed && !empty;
    const showsTable = (!this.loading && !failed && !empty) || keepsRows;
    if (!this.loading) this.hadRows = showsTable;

    let status: unknown = fillTemplate(labels.summary, {
      from: format(view.first + 1),
      to: format(view.first + view.shown.length),
      total: format(view.total),
    });
    if (this.loading) status = labels.loading;
    else if (failed) {
      status = (
        <idg-alert variant="danger" quiet>
          {this.error}
        </idg-alert>
      );
    } else if (empty) status = labels.empty;

    return (
      <div
        class={{ events: true, busy: keepsRows }}
        part="group"
        role="group"
        aria-label={caption === "" ? undefined : caption}
        aria-busy={this.loading ? "true" : undefined}
      >
        {showsTable ? null : (
          <p class="caption" part="caption">
            {caption}
          </p>
        )}
        {this.loading && !keepsRows ? (
          <div class="skeleton">
            <idg-skeleton variant="text" lines={5} />
          </div>
        ) : null}
        {showsTable ? this.renderTable(view, labels, format, language) : null}
        <div class="status" part="status" role="status" tabindex="-1">
          {status}
        </div>
        {showsTable && view.pageCount > 1 ? (
          <idg-pagination
            class="pagination"
            part="pagination"
            page={view.page}
            pageCount={view.pageCount}
            label={labels.paginationLabel}
            previousLabel={labels.previousPage}
            nextLabel={labels.nextPage}
            pageLabel={labels.page}
            onIdgPageChange={this.handlePageChange}
          />
        ) : null}
      </div>
    );
  }
}

type Format = (value: number) => string;
