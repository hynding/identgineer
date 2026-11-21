import { Component, h, Prop } from "@stencil/core";
import type { BreadcrumbSeparator } from "../breadcrumb/breadcrumb-options";

/**
 * One step of an idg-breadcrumb. It is a list item whose link, or plain text for a step without
 * one, and separator are drawn in its own shadow root.
 *
 * @slot - The step's text.
 * @part link - The link, or the text when there is no link.
 * @part separator - The mark after the step.
 */
@Component({
  tag: "idg-breadcrumb-item",
  shadow: true,
})
export class IdgBreadcrumbItem {
  /** Where the step goes. Only http, https, mailto, tel and relative urls are kept. */
  @Prop() href?: string;

  /** Marks this step as the current page, in place of the last one. */
  @Prop() current = false;

  /** Set by the breadcrumb: whether this step is the current page. */
  @Prop() isCurrent = false;

  /** Set by the breadcrumb: whether this is the last step, which has no separator after it. */
  @Prop() isLast = false;

  /** Set by the breadcrumb: the mark after the step. */
  @Prop() separator: BreadcrumbSeparator = "chevron";

  render() {
    return <div />;
  }
}
