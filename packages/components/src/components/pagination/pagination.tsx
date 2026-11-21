import { Component, Element, Event, h, Prop, type EventEmitter } from "@stencil/core";
import type { PageChangeDetail } from "./pagination-options";

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

  render() {
    return <nav />;
  }
}
