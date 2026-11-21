import { Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { GAP_STEPS, stepOf, type GapStep } from "../../utils/layout-steps";
import { COVER_HEIGHTS, type CoverHeight } from "./cover-options";

/**
 * A block at least as tall as `min-height` that centres its content, with optional regions pinned
 * to its top and bottom, such as a hero, a splash or a sign-in screen. It only arranges, so it
 * adds no role and the source order stays the reading order.
 *
 * @slot top - Pinned to the top, drawn before the content.
 * @slot - The content, centred in the space the other regions leave.
 * @slot bottom - Pinned to the bottom, drawn after the content.
 * @part cover - The element that lays the regions out.
 * @part center - The wrapper around the default slot.
 */
@Component({
  tag: "idg-cover",
  styleUrls: ["cover.css", "../../styles/layout-gap.css", "../../styles/layout-size.css"],
  shadow: true,
})
export class IdgCover {
  /** Least height of the block, a step of the size scale, or `screen` for the height of the viewport. */
  @Prop({ reflect: true, attribute: "min-height" }) minHeight: CoverHeight = "l";

  /** Space between the regions, a step of the space scale. Without it the layout's gap is used. */
  @Prop({ reflect: true }) gap?: GapStep;

  render() {
    const height = oneOf(COVER_HEIGHTS, this.minHeight, "l");
    const gap = stepOf(GAP_STEPS, this.gap);
    return (
      <div
        class={{
          cover: true,
          [`size-${height}`]: true,
          [`gap-${String(gap)}`]: gap !== undefined,
        }}
        part="cover"
      >
        <slot name="top" />
        <div class="center" part="center">
          <slot />
        </div>
        <slot name="bottom" />
      </div>
    );
  }
}
