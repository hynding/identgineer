import { Component, h, Host, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { safeUrl } from "../../utils/safe-url";
import { BREADCRUMB_SEPARATORS, type BreadcrumbSeparator } from "../breadcrumb/breadcrumb-options";

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
  styleUrls: ["../../styles/focus-ring.css", "breadcrumb-item.css"],
  shadow: true,
})
export class IdgBreadcrumbItem {
  /** Where the step goes. Only http, https, mailto, tel and relative urls are kept. */
  @Prop() href?: string;

  /** Marks this step as the current page, in place of the last one. */
  @Prop({ reflect: true }) current = false;

  /** Set by the breadcrumb: whether this step is the current page. */
  @Prop() isCurrent = false;

  /** Set by the breadcrumb: whether this is the last step, which has no separator after it. */
  @Prop() isLast = false;

  /** Set by the breadcrumb: the mark after the step. */
  @Prop() separator: BreadcrumbSeparator = "chevron";

  render() {
    const href = safeUrl(this.href);
    const separator = oneOf(BREADCRUMB_SEPARATORS, this.separator, "chevron");
    const classes = { crumb: true, current: this.isCurrent, linked: href !== undefined };
    return (
      <Host role="listitem">
        {href === undefined ? (
          <span class={classes} part="link" aria-current={this.isCurrent ? "page" : undefined}>
            <slot />
          </span>
        ) : (
          <a
            class={{ ...classes, focusable: true }}
            part="link"
            href={href}
            aria-current={this.isCurrent ? "page" : undefined}
          >
            <slot />
          </a>
        )}
        {this.isLast ? null : (
          <span class={`separator separator-${separator}`} part="separator" aria-hidden="true">
            {separator === "slash" ? "/" : <idg-icon name="chevron-right" size="sm" />}
          </span>
        )}
      </Host>
    );
  }
}
