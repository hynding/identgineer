import { Component, Element, h, Prop, State } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { headingLevel } from "../../utils/heading-level";
import { linkRel } from "../../utils/link-rel";
import { safeUrl } from "../../utils/safe-url";
import {
  CARD_PADDINGS,
  CARD_VARIANTS,
  DEFAULT_HEADING_LEVEL,
  type CardPadding,
  type CardVariant,
} from "./card-options";
import { NO_SLOTS, readCardSlots, type CardSlots } from "./card-slots";

/**
 * A surface that groups related content, drawn in the design language's own surface, border and
 * elevation.
 *
 * With `href` and a `heading`, the heading becomes the card's one link and covers the whole card, so
 * a click anywhere follows it while assistive technology still finds a single link. Anything in
 * the footer slot sits above the link and stays clickable.
 *
 * @slot media - A picture or other full-bleed content at the top.
 * @slot header - Content in the header beside or below the heading, such as an eyebrow or a badge.
 * @slot - The body.
 * @slot footer - Actions or metadata at the bottom.
 * @part card - The card surface.
 * @part media - The wrapper around the media slot.
 * @part header - The wrapper around the heading and header slot.
 * @part heading - The heading element.
 * @part body - The wrapper around the default slot.
 * @part footer - The wrapper around the footer slot.
 */
@Component({
  tag: "idg-card",
  styleUrls: ["../../styles/focus-ring.css", "card.css"],
  shadow: true,
})
export class IdgCard {
  @Element() host!: HTMLElement;

  /** Surface treatment. */
  @Prop({ reflect: true }) variant: CardVariant = "plain";

  /** Space inside the card around its content. */
  @Prop({ reflect: true }) padding: CardPadding = "md";

  /** Lifts the whole card on hover. A card with a link is always interactive. */
  @Prop({ reflect: true }) interactive = false;

  /** The card's title, drawn as a heading. */
  @Prop() heading?: string;

  /** The heading level, 1 to 6. */
  @Prop({ attribute: "heading-level" }) headingLevel = DEFAULT_HEADING_LEVEL;

  /** Makes the heading a link that covers the card. Only http, https, mailto, tel and relative urls are kept. */
  @Prop() href?: string;

  /** Where the link opens. Anything but `_self` adds `rel="noopener noreferrer"`. */
  @Prop() target?: string;

  /** Link relationship. */
  @Prop() rel?: string;

  @State() private slots: CardSlots = NO_SLOTS;

  private observer?: MutationObserver;

  connectedCallback(): void {
    if (typeof MutationObserver === "undefined") return;
    // A slotchange fires only for a slot that is drawn, and the regions are drawn only when they
    // have content, so the light DOM is watched directly.
    this.observer = new MutationObserver(() => {
      this.readSlots();
    });
    this.observer.observe(this.host, { subtree: true, childList: true, characterData: true });
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
  }

  componentWillLoad(): void {
    this.readSlots();
  }

  private readSlots(): void {
    const next = readCardSlots(this.host.childNodes);
    const current = this.slots;
    if (
      next.media !== current.media ||
      next.header !== current.header ||
      next.body !== current.body ||
      next.footer !== current.footer
    ) {
      this.slots = next;
    }
  }

  private renderHeading(href: string | undefined) {
    if (this.heading === undefined || this.heading === "") return null;
    const Heading = `h${String(headingLevel(this.headingLevel, DEFAULT_HEADING_LEVEL))}`;
    return (
      <Heading class="heading" part="heading">
        {href === undefined ? (
          this.heading
        ) : (
          <a
            class="stretch focusable"
            href={href}
            target={this.target}
            rel={linkRel(this.target, this.rel)}
          >
            {this.heading}
          </a>
        )}
      </Heading>
    );
  }

  render() {
    const variant = oneOf(CARD_VARIANTS, this.variant, "plain");
    const padding = oneOf(CARD_PADDINGS, this.padding, "md");
    const hasHeading = this.heading !== undefined && this.heading !== "";
    const href = hasHeading ? safeUrl(this.href) : undefined;
    const { media, header, body, footer } = this.slots;

    return (
      <div
        class={{
          card: true,
          [`variant-${variant}`]: true,
          [`padding-${padding}`]: true,
          interactive: this.interactive || href !== undefined,
        }}
        part="card"
      >
        {media ? (
          <div class="media" part="media">
            <slot name="media" />
          </div>
        ) : null}
        {hasHeading || header ? (
          <div class="header" part="header">
            {this.renderHeading(href)}
            <slot name="header" />
          </div>
        ) : null}
        {body ? (
          <div class="body" part="body">
            <slot />
          </div>
        ) : null}
        {footer ? (
          <div class="footer" part="footer">
            <slot name="footer" />
          </div>
        ) : null}
      </div>
    );
  }
}
