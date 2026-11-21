import { Component, Element, h, Prop } from "@stencil/core";
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
  shadow: true,
})
export class IdgBreadcrumb {
  @Element() host!: HTMLElement;

  /** The landmark's accessible name. Give each breadcrumb on a page its own. */
  @Prop() label = "Breadcrumb";

  /** The mark between items. It is decoration and hidden from assistive technology. */
  @Prop({ reflect: true }) separator: BreadcrumbSeparator = BREADCRUMB_SEPARATORS[0];

  render() {
    return <div />;
  }
}
