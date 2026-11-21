import {
  Component,
  Element,
  Event,
  h,
  Listen,
  Prop,
  State,
  Watch,
  type EventEmitter,
} from "@stencil/core";
import { reflectLabelledBy } from "../../utils/aria-reflection";
import { safeCssLength } from "../../utils/css-length";
import { oneOf } from "../../utils/choice";
import { deepActiveElement } from "../../utils/focus";
import { adoptStyles, type StyleRoot } from "../../utils/light-styles";
import { sortedRowOrder, type SortDirection } from "../../utils/sort-rows";
import {
  addSortButton,
  bodyGroups,
  captionOf,
  columnIndex,
  hasSortButton,
  rowsOf,
  slottedTable,
  sortKeyOf,
  sortValueOf,
  sortableHeaders,
} from "./table-dom";
import { SORT_DIRECTIONS, type TableSortDetail } from "./table-options";
import { tableSheet } from "./table-light-styles";

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
  styleUrls: ["../../styles/visually-hidden.css", "../../styles/focus-ring.css", "table.css"],
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

  @State() private scrollable = false;
  @State() private status = "";

  private scroller?: HTMLElement;
  private releaseStyles?: () => void;
  private mutationObserver?: MutationObserver;
  private sizeObserver?: ResizeObserver;
  private loaded = false;
  // Rows are numbered in the order they were first seen, so the original order can be restored.
  private readonly rowOrder = new WeakMap<Element, number>();
  private rowCount = 0;

  connectedCallback(): void {
    this.adoptStyles();
    this.watchTable();
    if (!this.loaded) return;
    // The table may have changed while it was out of the page, with nobody watching.
    this.refresh();
    this.watchSize();
  }

  disconnectedCallback(): void {
    this.releaseStyles?.();
    this.releaseStyles = undefined;
    this.mutationObserver?.disconnect();
    this.mutationObserver = undefined;
    this.sizeObserver?.disconnect();
    this.sizeObserver = undefined;
  }

  componentDidLoad(): void {
    this.loaded = true;
    this.refresh();
    this.watchSize();
  }

  componentDidRender(): void {
    this.syncScroller();
  }

  @Watch("sortKey")
  @Watch("sortDirection")
  @Watch("manualSort")
  sortChanged(): void {
    this.applySort();
    this.mutationObserver?.takeRecords();
  }

  @Listen("click")
  handleClick(event: MouseEvent): void {
    const button = (event.target as Element).closest("button.idg-table-sort");
    const header = button?.parentElement;
    const table = slottedTable(this.host);
    if (!button || !header || !table?.contains(button)) return;
    const key = sortKeyOf(header);
    const direction: SortDirection =
      this.sortKey === key && this.sortDirection === "ascending" ? "descending" : "ascending";
    this.sortKey = key;
    this.sortDirection = direction;
    this.status = this.sortStatus
      .split("{column}")
      .join(header.textContent.trim())
      .split("{direction}")
      .join(direction);
    this.idgSort.emit({ key, direction });
  }

  // The cells are the page's, out of reach of this shadow root, so the stylesheet for them is
  // adopted into the tree the table is in. It is adopted again if the table is moved elsewhere.
  private adoptStyles(): void {
    this.releaseStyles?.();
    this.releaseStyles = undefined;
    const sheet = tableSheet();
    const root = this.host.getRootNode();
    if (sheet && "adoptedStyleSheets" in root) {
      this.releaseStyles = adoptStyles(root as unknown as StyleRoot, sheet);
    }
  }

  private watchTable(): void {
    this.mutationObserver?.disconnect();
    if (typeof MutationObserver === "undefined") return;
    this.mutationObserver = new MutationObserver(() => {
      this.refresh();
    });
    this.mutationObserver.observe(this.host, { childList: true, subtree: true });
  }

  private watchSize(): void {
    this.sizeObserver?.disconnect();
    this.sizeObserver = undefined;
    if (typeof ResizeObserver === "undefined" || !this.scroller) return;
    this.sizeObserver = new ResizeObserver(() => {
      this.measure();
    });
    this.sizeObserver.observe(this.scroller);
    const table = slottedTable(this.host);
    if (table) this.sizeObserver.observe(table);
    this.measure();
  }

  // A scroll area is reachable and named only while there is something to scroll, since an area
  // that does not scroll is not a region worth a stop.
  private measure(): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const next =
      scroller.scrollWidth > scroller.clientWidth + 1 ||
      scroller.scrollHeight > scroller.clientHeight + 1;
    if (next !== this.scrollable) this.scrollable = next;
  }

  private syncScroller(): void {
    const scroller = this.scroller;
    if (!scroller) return;
    this.setLength(scroller, "--_max-height", this.maxHeight);
    this.setLength(scroller, "--_min-width", this.minWidth);
    const table = slottedTable(this.host);
    const caption = table ? captionOf(table) : undefined;
    const named = this.label !== undefined && this.label !== "";
    reflectLabelledBy(scroller, this.scrollable && !named && caption ? [caption] : null);
  }

  private setLength(element: HTMLElement, property: string, value: string | undefined): void {
    const safe = safeCssLength(value);
    if (safe === undefined) element.style.removeProperty(property);
    else element.style.setProperty(property, safe);
  }

  private refresh(): void {
    const table = slottedTable(this.host);
    if (table) {
      for (const header of sortableHeaders(table)) {
        if (!hasSortButton(header)) addSortButton(header);
      }
    }
    this.applySort();
    // What was changed above is this component's own doing, and need not wake it again.
    this.mutationObserver?.takeRecords();
  }

  private applySort(): void {
    const table = slottedTable(this.host);
    if (!table) return;
    const direction = oneOf(SORT_DIRECTIONS, this.sortDirection, "ascending");
    const headers = sortableHeaders(table);
    const active =
      this.sortKey === ""
        ? undefined
        : headers.find((header) => sortKeyOf(header) === this.sortKey);
    for (const header of headers) {
      if (header === active) header.setAttribute("aria-sort", direction);
      else header.removeAttribute("aria-sort");
    }
    if (!this.manualSort) this.arrangeRows(table, active, direction);
  }

  private arrangeRows(
    table: HTMLElement,
    header: HTMLElement | undefined,
    direction: SortDirection,
  ): void {
    const column = header ? columnIndex(header) : -1;
    for (const group of bodyGroups(table)) {
      const rows = rowsOf(group);
      for (const row of rows) {
        if (!this.rowOrder.has(row)) this.rowOrder.set(row, this.rowCount++);
      }
      const order = header
        ? sortedRowOrder(
            rows.map((row) => sortValueOf(row, column)),
            direction,
          )
        : rows
            .map((_row, index) => index)
            .sort(
              (left, right) =>
                (this.rowOrder.get(rows[left] as Element) ?? 0) -
                (this.rowOrder.get(rows[right] as Element) ?? 0),
            );
      if (order.every((position, index) => position === index)) continue;
      this.moveRows(
        group,
        order.flatMap((position) => rows[position] ?? []),
      );
    }
  }

  // Moving a row takes focus from anything inside it, so focus is put back.
  private moveRows(group: HTMLElement, rows: readonly HTMLElement[]): void {
    const active = deepActiveElement() as HTMLElement | null;
    const focused = active && group.contains(active) ? active : undefined;
    for (const row of rows) group.append(row);
    focused?.focus({ preventScroll: true });
  }

  render() {
    const labelled = this.label !== undefined && this.label !== "";
    return [
      <div
        ref={(element) => (this.scroller = element)}
        class={{ scroller: true, focusable: this.scrollable }}
        part="scroller"
        role={this.scrollable ? "region" : undefined}
        tabindex={this.scrollable ? "0" : undefined}
        aria-label={this.scrollable && labelled ? this.label : undefined}
      >
        <slot
          onSlotchange={() => {
            this.refresh();
            this.watchSize();
          }}
        />
      </div>,
      // The region exists before a sort does, so changing its text is what is announced.
      <div class="visually-hidden" role="status">
        {this.status}
      </div>,
    ];
  }
}
