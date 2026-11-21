import { Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { GAP_STEPS, type GapStep } from "../../utils/layout-steps";
import { STACK_ALIGNMENTS, type StackAlignment } from "./stack-options";

/**
 * Vertical flow: children one under another with an even gap. It only arranges, so it adds no role
 * and the source order stays the reading order.
 *
 * @slot - The children, in reading order.
 * @part stack - The element that lays the children out.
 */
@Component({
  tag: "idg-stack",
  styleUrls: ["stack.css", "../../styles/layout-gap.css"],
  shadow: true,
})
export class IdgStack {
  /** Space between children, a step of the space scale. Without it the layout's gap is used. */
  @Prop({ reflect: true }) gap?: GapStep;

  /** Where children sit on the inline axis. */
  @Prop({ reflect: true }) align: StackAlignment = "stretch";

  /** Draws a rule between children, in the theme's border colour. */
  @Prop({ reflect: true }) dividers = false;

  render() {
    const gap = oneOf(GAP_STEPS, this.gap, undefined);
    const align = oneOf(STACK_ALIGNMENTS, this.align, "stretch");
    return (
      <div
        class={{
          stack: true,
          [`align-${align}`]: true,
          [`gap-${String(gap)}`]: gap !== undefined,
          dividers: this.dividers,
        }}
        part="stack"
      >
        <slot />
      </div>
    );
  }
}
