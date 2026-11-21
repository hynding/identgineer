import { Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { BADGE_SIZES, BADGE_VARIANTS, type BadgeSize, type BadgeVariant } from "./badge-options";

/**
 * A short status or count label. Its meaning is in its text; the variant only adds emphasis.
 *
 * @slot - The label.
 * @part badge - The badge box.
 * @part dot - The leading dot.
 * @part label - The wrapper around the default slot.
 */
@Component({
  tag: "idg-badge",
  styleUrls: ["../../styles/tone.css", "badge.css"],
  shadow: true,
})
export class IdgBadge {
  /** Emphasis and meaning. */
  @Prop({ reflect: true }) variant: BadgeVariant = "neutral";

  /** Badge size. */
  @Prop({ reflect: true }) size: BadgeSize = "md";

  /** Shows a dot before the label. */
  @Prop() dot = false;

  render() {
    const variant = oneOf(BADGE_VARIANTS, this.variant, "neutral");
    const size = oneOf(BADGE_SIZES, this.size, "md");
    return (
      <span
        class={{ badge: true, [`variant-${variant}`]: true, [`size-${size}`]: true }}
        part="badge"
      >
        {this.dot ? <span class="dot" part="dot" aria-hidden="true" /> : null}
        <span class="label" part="label">
          <slot />
        </span>
      </span>
    );
  }
}
