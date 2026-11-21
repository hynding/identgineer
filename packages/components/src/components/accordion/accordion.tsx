import { Component, Element, h, Prop } from "@stencil/core";
import { DEFAULT_ACCORDION_HEADING_LEVEL } from "./accordion-options";

/**
 * A stack of idg-accordion-item, each a heading whose button shows or hides its panel. By default
 * one item is open at a time. Up and Down, Home and End move between the headers.
 *
 * @slot - `idg-accordion-item` elements.
 * @part accordion - The wrapper around the items.
 */
@Component({
  tag: "idg-accordion",
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

  render() {
    return <div class="accordion" />;
  }
}
