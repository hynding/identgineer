import { Component, h, Prop } from "@stencil/core";
import { linkRel, safeUrl } from "../../utils/controls-copies";

/**
 * An inline text link. It takes the same hardening as the button's link mode: the url goes
 * through `safeUrl` and a link that opens another browsing context always gets `noopener
 * noreferrer`.
 *
 * @slot - The link text.
 * @part control - The native anchor.
 */
@Component({
  tag: "idg-link",
  styleUrls: ["../../styles/focus-ring.css", "link.css"],
  shadow: true,
})
export class IdgLink {
  /** Where the link goes. Only http, https, mailto, tel and relative urls are kept. */
  @Prop() href?: string;

  /** Where the link opens. Anything but `_self` adds `rel="noopener noreferrer"`. */
  @Prop() target?: string;

  /** Link relationship. */
  @Prop() rel?: string;

  /** Marks a link to another site: shows an indicator and opens a new tab unless `target` is set. */
  @Prop({ reflect: true }) external = false;

  /** The accessible name of the external indicator. */
  @Prop({ attribute: "external-label" }) externalLabel = "External link";

  render() {
    const href = safeUrl(this.href);
    // Without an href an anchor is neither focusable nor a link, so it is given the role back
    // and marked unavailable, which is how an unsafe or missing url is shown.
    if (href === undefined) {
      return (
        <a class="control focusable" part="control" role="link" aria-disabled="true">
          <slot />
        </a>
      );
    }
    const target = this.target ?? (this.external ? "_blank" : undefined);
    return (
      <a
        class="control focusable"
        part="control"
        href={href}
        target={target}
        rel={linkRel(target, this.rel)}
      >
        <slot />
        {this.external ? (
          <idg-icon class="external" name="external-link" size="sm" label={this.externalLabel} />
        ) : null}
      </a>
    );
  }
}
