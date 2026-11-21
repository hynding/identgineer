import { Component, Element, Event, h, Prop, type EventEmitter } from "@stencil/core";
import type { SortDirection } from "../../utils/sort-rows";
import type { TableSortDetail } from "./table-options";

/**
 * Wraps a native `<table>` that you slot in, so the table keeps its own semantics (caption,
 * header cells, row and column relations) and the component adds what a table needs around it: a
 * surface drawn in the design language, a scroll region that is reachable by keyboard and named
 * when the table is wider than the page, a sticky header, stripes, density from the UX mode, and
 * sortable column headers.
 *
 * The cells are the page's own, so a shadow root cannot style them. The component adopts a
 * constructable stylesheet into the document or shadow root the table lives in, scoped to
 * `idg-table > table` and in a cascade layer so the page's own CSS wins. A browser without
 * constructable stylesheets shows the table unstyled.
 *
 * A header cell with `data-sortable` becomes a sort button. Its value is the column's key, or
 * empty to use the column's position. A cell sorts by its `data-sort-value`, or else its text.
 *
 * @slot - A native `<table>`, with a `<caption>` to name it.
 * @part scroller - The scroll region that holds the table.
 */
@Component({
  tag: "idg-table",
  shadow: true,
})
export class IdgTable {
  @Element() host!: HTMLElement;

  /** The scroll region's accessible name, when the table is wider than the page. The caption is used without it. */
  @Prop() label?: string;

  /** Keeps the header in view while the rows scroll. It needs `maxHeight`, as the rows scroll in the region. */
  @Prop({ attribute: "sticky-header", reflect: true }) stickyHeader = false;

  /** Shades every other row. */
  @Prop({ reflect: true }) striped = false;

  /** The tallest the region grows before its rows scroll, as a length such as `24rem`. */
  @Prop({ attribute: "max-height" }) maxHeight?: string;

  /** The narrowest the table is drawn before it scrolls sideways, as a length such as `40rem`. */
  @Prop({ attribute: "min-width" }) minWidth?: string;

  /** The key of the column the rows are sorted by. Empty leaves them in their original order. */
  @Prop({ mutable: true, reflect: true, attribute: "sort-key" }) sortKey = "";

  /** The direction of the sort. */
  @Prop({ mutable: true, reflect: true, attribute: "sort-direction" })
  sortDirection: SortDirection = "ascending";

  /** Only marks the sorted column and reports the sort. Use it when you sort the rows yourself, such as on a server. */
  @Prop({ attribute: "manual-sort" }) manualSort = false;

  /** Announced after a sort, where `{column}` is the column and `{direction}` is ascending or descending. */
  @Prop({ attribute: "sort-status" }) sortStatus = "Sorted by {column}, {direction}";

  /** Fires when the user chooses a column to sort by, and not when `sortKey` is set from script. */
  @Event() idgSort!: EventEmitter<TableSortDetail>;

  render() {
    return <div />;
  }
}
