import { Component, Element, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { BREADCRUMB_SEPARATORS, type BreadcrumbSeparator } from "./breadcrumb-options";

/**
 * The trail of pages that led to this one, as a navigation landmark holding an ordered list of
 * idg-breadcrumb-item. The last item is the current page unless another item says it is.
 *
 * @slot - `idg-breadcrumb-item` elements, from the top of the site down to the current page.
 * @part nav - The navigation landmark.
 * @part list - The ordered list.
 */
@Component({
  tag: "idg-breadcrumb",
  styleUrl: "breadcrumb.css",
  shadow: true,
})
export class IdgBreadcrumb {
  @Element() host!: HTMLElement;

  /** The landmark's accessible name. Give each breadcrumb on a page its own. */
  @Prop() label = "Breadcrumb";

  /** The mark between items. It is decoration and hidden from assistive technology. */
  @Prop({ reflect: true }) separator: BreadcrumbSeparator = BREADCRUMB_SEPARATORS[0];

  private observer?: MutationObserver;
  private loaded = false;

  connectedCallback(): void {
    this.watch();
    // Items may have changed while it was out of the page, with nobody watching.
    if (this.loaded) this.syncItems();
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  componentDidLoad(): void {
    this.loaded = true;
  }

  componentDidRender(): void {
    this.syncItems();
  }

  // Slotchange reports items added, removed and reordered, but not one that is hidden or becomes
  // the current page, so those attributes are watched on the items.
  private watch(): void {
    this.observer?.disconnect();
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver((records) => {
      if (records.some((record) => record.target.parentNode === this.host)) this.syncItems();
    });
    this.observer.observe(this.host, {
      attributes: true,
      subtree: true,
      attributeFilter: ["current", "hidden"],
    });
  }

  private allItems(): HTMLIdgBreadcrumbItemElement[] {
    return Array.from(this.host.children).filter(
      (child): child is HTMLIdgBreadcrumbItemElement => child.localName === "idg-breadcrumb-item",
    );
  }

  // Each item is drawn in its own shadow root and cannot see its neighbours, so what depends on
  // them, which one is last and which is current, is handed down.
  private syncItems(): void {
    const all = this.allItems();
    const items = all.filter((item) => !item.hasAttribute("hidden"));
    // An item that is hidden takes no part, and carries nothing over from when it was shown.
    for (const item of all) {
      if (!items.includes(item)) {
        item.isLast = false;
        item.isCurrent = false;
      }
    }
    const marked = items.find((item) => item.current);
    const last = items[items.length - 1];
    const separator = oneOf(BREADCRUMB_SEPARATORS, this.separator, "chevron");
    for (const item of items) {
      item.isLast = item === last;
      item.isCurrent = marked === undefined ? item === last : item === marked;
      item.separator = separator;
    }
  }

  render() {
    return (
      <nav class="nav" part="nav" aria-label={this.label}>
        {/* Restated because a list without markers loses its role in some screen readers. */}
        <ol class="list" part="list" role="list">
          <slot
            onSlotchange={() => {
              this.syncItems();
            }}
          />
        </ol>
      </nav>
    );
  }
}
