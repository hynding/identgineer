import { Component, Element, h, Listen, Prop, Watch } from "@stencil/core";
import { headingLevel } from "../../utils/heading-level";
import { rovingMove } from "../../utils/roving";
import {
  DEFAULT_ACCORDION_HEADING_LEVEL,
  MAX_REGION_ITEMS,
  type AccordionToggleDetail,
} from "./accordion-options";

/**
 * A stack of idg-accordion-item, each a heading whose button shows or hides its panel. By default
 * one item is open at a time. Up and Down, Home and End move between the headers.
 *
 * @slot - `idg-accordion-item` elements.
 * @part accordion - The wrapper around the items.
 */
@Component({
  tag: "idg-accordion",
  styleUrl: "accordion.css",
  shadow: true,
})
export class IdgAccordion {
  @Element() host!: HTMLElement;

  /** Lets several items be open at once. Otherwise opening one closes the others. */
  @Prop({ reflect: true }) multiple = false;

  /** The level of every item's heading, 1 to 6. Pick the one that follows the page's own heading. */
  @Prop({ attribute: "heading-level" }) headingLevel = DEFAULT_ACCORDION_HEADING_LEVEL;

  /**
   * Lets the browser's find in page open a closed item that holds the text it finds, by hiding
   * closed panels with `hidden="until-found"`. A browser without it hides them as usual.
   */
  @Prop({ attribute: "find-in-page" }) findInPage = false;

  connectedCallback(): void {
    // Items may have come or gone while it was out of the page.
    if (this.loaded) this.sync();
  }

  componentDidLoad(): void {
    this.loaded = true;
  }

  componentDidRender(): void {
    this.sync();
  }

  @Watch("multiple")
  multipleChanged(): void {
    this.sync();
  }

  @Listen("idgToggle")
  handleToggle(event: CustomEvent<AccordionToggleDetail>): void {
    if (this.multiple || !event.detail.open) return;
    const items = this.items();
    // The event bubbles out of items of an accordion nested in a panel, which are not this
    // accordion's to arrange.
    if (!items.some((item) => item === event.target)) return;
    for (const item of items) {
      if (item !== event.target && item.open) item.open = false;
    }
  }

  @Listen("keydown")
  handleKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const items = this.items();
    // Only a key pressed on a header's button moves between headers. One pressed in a panel is
    // the panel's own, and the panel's content is not in the item's shadow root.
    const origin = event.composedPath()[0] as Node | undefined;
    const current = items.findIndex(
      (item) => origin !== undefined && item.shadowRoot?.contains(origin),
    );
    if (current === -1) return;
    const enabled = items.map((item) => !item.disabled);
    const next = rovingMove(current, event.key, enabled, "vertical", false);
    if (next === undefined) return;
    event.preventDefault();
    void items[next]?.setFocus();
  }

  private loaded = false;
  private readonly seen = new WeakSet<Element>();

  private items(): HTMLIdgAccordionItemElement[] {
    return Array.from(this.host.children).filter(
      (child): child is HTMLIdgAccordionItemElement => child.localName === "idg-accordion-item",
    );
  }

  // The items are drawn in their own shadow roots and cannot see each other, so what depends on
  // the others is handed down: the heading level, whether a closed panel can be found, and
  // whether there are few enough items for each panel to be a landmark.
  private sync(): void {
    const items = this.items();
    const level = headingLevel(this.headingLevel, DEFAULT_ACCORDION_HEADING_LEVEL);
    const regions = items.length <= MAX_REGION_ITEMS;
    for (const item of items) {
      item.headingLevel = level;
      item.hasRegion = regions;
      item.findInPage = this.findInPage;
    }
    if (!this.multiple) this.keepOneOpen(items);
    for (const item of items) this.seen.add(item);
  }

  // One item stays open: one that has just been added open wins, since it is the newest request,
  // and otherwise the first. At first load every item is new, so the first one marked open wins.
  private keepOneOpen(items: readonly HTMLIdgAccordionItemElement[]): void {
    const open = items.filter((item) => item.open);
    if (open.length < 2) return;
    const added = this.loaded ? open.filter((item) => !this.seen.has(item)) : [];
    const winner = added[0] ?? open[0];
    // At load the correction is not a change anyone made, so it is not announced. Whether the
    // item had already rendered would otherwise decide that.
    for (const item of open) {
      if (item === winner) continue;
      item.quiet = !this.loaded;
      item.open = false;
      item.quiet = false;
    }
  }

  render() {
    return (
      <div class="accordion" part="accordion">
        <slot
          onSlotchange={() => {
            this.sync();
          }}
        />
      </div>
    );
  }
}
