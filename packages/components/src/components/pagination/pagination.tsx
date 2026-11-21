import { Component, Element, Event, h, Prop, type EventEmitter } from "@stencil/core";
import { pageHref } from "../../utils/page-href";
import { paginationRange } from "../../utils/pagination-range";
import type { PageChangeDetail } from "./pagination-options";

// Typed explicitly because Stencil's DOM typings allow null here and the editor's do not.
function labelOf(element: Node): string {
  const text: string | null = element.textContent;
  return (text ?? "").trim();
}

type Direction = "previous" | "next";

/**
 * Page controls for a long list: previous and next, the current page and a window of its
 * neighbours, with the pages in between left out. The controls are links when `hrefTemplate` is
 * given, so each page is an address that can be opened, shared and followed without script, and
 * buttons that fire `idgPageChange` otherwise.
 *
 * @part nav - The navigation landmark.
 * @part list - The list of controls.
 * @part page - The control of a page number.
 * @part previous - The previous control.
 * @part next - The next control.
 */
@Component({
  tag: "idg-pagination",
  styleUrls: ["../../styles/control.css", "pagination.css"],
  shadow: true,
})
export class IdgPagination {
  @Element() host!: HTMLElement;

  /** The current page, from 1. */
  @Prop({ mutable: true, reflect: true }) page = 1;

  /** How many pages there are. */
  @Prop({ attribute: "page-count", reflect: true }) pageCount = 1;

  /** Pages shown on each side of the current one. */
  @Prop() siblings = 1;

  /** Pages always shown at the start and the end. */
  @Prop() boundaries = 1;

  /**
   * Makes the controls links. `{page}` is replaced by the page number, as in `/items?page={page}`.
   * Only http, https, mailto, tel and relative urls are kept.
   */
  @Prop({ attribute: "href-template" }) hrefTemplate?: string;

  /** The landmark's accessible name. Give each pagination on a page its own. */
  @Prop() label = "Pagination";

  /** The accessible name of the previous control. */
  @Prop({ attribute: "previous-label" }) previousLabel = "Previous page";

  /** The accessible name of the next control. */
  @Prop({ attribute: "next-label" }) nextLabel = "Next page";

  /** The accessible name of a page control, where `{page}` is the number. */
  @Prop({ attribute: "page-label" }) pageLabel = "Page {page}";

  /**
   * Fires when the user chooses a page other than the current one. Call `preventDefault()` to
   * keep the page where it is, for instance to load the page yourself first. On a link it also
   * stops the link being followed.
   */
  @Event({ cancelable: true }) idgPageChange!: EventEmitter<PageChangeDetail>;

  // The control that had focus before the list was drawn. Drawing moves the list items around,
  // which drops focus from a control that is still there, whatever caused the draw.
  private heldControl?: { part: string; label: string };

  componentWillRender(): void {
    const active = this.host.shadowRoot?.activeElement;
    this.heldControl = active
      ? { part: active.getAttribute("part") ?? "", label: labelOf(active) }
      : undefined;
  }

  componentDidRender(): void {
    const held = this.heldControl;
    this.heldControl = undefined;
    if (!held) return;
    const shadow = this.host.shadowRoot;
    const active = shadow?.activeElement;
    const unavailable =
      active?.hasAttribute("disabled") === true || active?.getAttribute("aria-disabled") === "true";
    // Focus that is somewhere else was put there on purpose, by a listener of idgPageChange for
    // instance, so only focus that fell to the page itself is brought back.
    const focused = document.activeElement;
    const fellToPage = !focused || focused === document.body;
    if (!unavailable && !(!active && fellToPage)) return;
    const same = Array.from(shadow?.querySelectorAll<HTMLElement>(".control") ?? []).find(
      (control) =>
        control.getAttribute("part") === held.part &&
        labelOf(control) === held.label &&
        !control.hasAttribute("disabled") &&
        control.getAttribute("aria-disabled") !== "true",
    );
    (same ?? shadow?.querySelector<HTMLElement>("[aria-current='page']"))?.focus();
  }

  private pageCountValue(): number {
    return Number.isFinite(this.pageCount) ? Math.max(0, Math.trunc(this.pageCount)) : 0;
  }

  private currentPage(): number {
    const count = this.pageCountValue();
    return Number.isFinite(this.page)
      ? Math.min(Math.max(Math.trunc(this.page), 1), Math.max(count, 1))
      : 1;
  }

  // The controls are links only for a template that makes a safe address for the first page.
  private isLinked(): boolean {
    return pageHref(this.hrefTemplate, 1) !== undefined;
  }

  private choose(kind: Direction | "page", page: number, event: MouseEvent): void {
    // A click with a modifier key, or on a secondary button, is the browser opening the link
    // elsewhere. It is not this page changing.
    if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = this.targetPage(kind, page);
    if (target === this.currentPage()) return;
    const change = this.idgPageChange.emit({ page: target });
    if (change.defaultPrevented) {
      event.preventDefault();
      return;
    }
    this.page = target;
  }

  // Previous and next are worked out when pressed, not when drawn, so two presses before the next
  // draw still go two pages.
  private targetPage(kind: Direction | "page", page: number): number {
    if (kind === "page") return page;
    const step = kind === "previous" ? -1 : 1;
    return Math.min(Math.max(this.currentPage() + step, 1), Math.max(this.pageCountValue(), 1));
  }

  private renderControl(
    kind: Direction | "page",
    page: number,
    unavailable: boolean,
    content: unknown,
    label: string,
  ) {
    const linked = this.isLinked();
    const current = kind === "page" && page === this.currentPage();
    const common = {
      class: { control: true, focusable: true, step: kind !== "page", current },
      part: kind,
      "aria-label": label,
      "aria-current": current ? "page" : undefined,
    };
    const onClick = (event: MouseEvent) => {
      this.choose(kind, page, event);
    };
    if (!linked) {
      return (
        <button type="button" {...common} disabled={unavailable} onClick={onClick}>
          {content}
        </button>
      );
    }
    // An anchor without an href is not focusable and not a link, so it is given the role back and
    // marked unavailable, as idg-link does.
    return unavailable ? (
      <a {...common} role="link" aria-disabled="true">
        {content}
      </a>
    ) : (
      <a {...common} href={pageHref(this.hrefTemplate, page)} onClick={onClick}>
        {content}
      </a>
    );
  }

  private renderStep(direction: Direction, target: number, unavailable: boolean) {
    const previous = direction === "previous";
    return (
      <li class="item" key={direction}>
        {this.renderControl(
          direction,
          target,
          unavailable,
          <idg-icon class="arrow" name={previous ? "chevron-left" : "chevron-right"} />,
          previous ? this.previousLabel : this.nextLabel,
        )}
      </li>
    );
  }

  render() {
    const count = this.pageCountValue();
    const current = this.currentPage();
    const tokens = paginationRange({
      page: current,
      pageCount: count,
      siblings: this.siblings,
      boundaries: this.boundaries,
    });
    return (
      <nav class="nav" part="nav" aria-label={this.label}>
        {/* Restated because a list without markers loses its role in some screen readers. */}
        <ul class="list" part="list" role="list">
          {this.renderStep("previous", Math.max(current - 1, 1), current <= 1)}
          {tokens.map((token) =>
            typeof token === "number" ? (
              <li class="item" key={token}>
                {this.renderControl(
                  "page",
                  token,
                  false,
                  String(token),
                  this.pageLabel.split("{page}").join(String(token)),
                )}
              </li>
            ) : (
              <li class="item gap" key={token} aria-hidden="true">
                <span class="ellipsis">…</span>
              </li>
            ),
          )}
          {this.renderStep("next", Math.min(current + 1, Math.max(count, 1)), current >= count)}
        </ul>
      </nav>
    );
  }
}
