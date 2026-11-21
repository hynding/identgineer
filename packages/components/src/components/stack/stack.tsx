import { Component, Element, h, Prop, Watch } from "@stencil/core";
import { itemsInSlot, watchItems } from "../../utils/slot-items";
import { oneOf } from "../../utils/choice";
import { GAP_STEPS, stepOf, type GapStep } from "../../utils/layout-steps";
import { STACK_ALIGNMENTS, type StackAlignment } from "./stack-options";

/** Marks the first item that is drawn, so that no rule is drawn above it. */
const FIRST_ITEM = "data-idg-stack-first";

/**
 * Vertical flow: children one under another with an even gap. It only arranges, so it adds no role
 * and the source order stays the reading order.
 *
 * @slot - The children, in reading order.
 *
 * With `dividers` the stack sets `data-idg-stack-first` on its first drawn child, because a rule
 * belongs above every child but that one and CSS in a shadow tree cannot tell which it is when
 * hidden children or templates come first. The attribute is removed when dividers are turned off.
 * @part stack - The element that lays the children out.
 */
@Component({
  tag: "idg-stack",
  styleUrls: ["stack.css", "../../styles/layout-gap.css"],
  shadow: true,
})
export class IdgStack {
  @Element() host!: HTMLElement;

  /** Space between children, a step of the space scale. Without it the layout's gap is used. */
  @Prop({ reflect: true }) gap?: GapStep;

  /** Where children sit on the inline axis. */
  @Prop({ reflect: true }) align: StackAlignment = "stretch";

  /** Draws a rule between children, in the theme's border colour. */
  @Prop({ reflect: true }) dividers = false;

  @Watch("dividers")
  markFirst(): void {
    for (const child of Array.from(this.host.children)) child.removeAttribute(FIRST_ITEM);
    if (!this.dividers) return;
    itemsInSlot(this.host, null)[0]?.setAttribute(FIRST_ITEM, "");
  }

  private stopWatching?: () => void;

  connectedCallback(): void {
    this.stopWatching = watchItems(this.host, () => {
      this.markFirst();
    });
  }

  disconnectedCallback(): void {
    this.stopWatching?.();
  }

  componentDidLoad(): void {
    this.markFirst();
  }

  render() {
    const gap = stepOf(GAP_STEPS, this.gap);
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
        <slot
          onSlotchange={() => {
            this.markFirst();
          }}
        />
      </div>
    );
  }
}
