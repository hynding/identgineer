import { Component, Element, h, Prop, State } from "@stencil/core";
import { itemsInSlot, watchItems } from "../../utils/slot-items";
import {
  GAP_STEPS,
  SIZE_STEPS,
  stepOf,
  type GapStep,
  type SizeStep,
} from "../../utils/layout-steps";
import { limitOf } from "./switcher-options";

/**
 * Items in one row that switch to one column when their container is narrower than `threshold`.
 * Every item is as wide as the others in either arrangement. There is no breakpoint and no script,
 * so it follows the width of its container rather than the viewport. It only arranges, so it adds
 * no role and the source order stays the reading order.
 *
 * @slot - The items, in reading order.
 * @part switcher - The element that lays the items out.
 */
@Component({
  tag: "idg-switcher",
  styleUrls: ["switcher.css", "../../styles/layout-gap.css", "../../styles/layout-size.css"],
  shadow: true,
})
export class IdgSwitcher {
  @Element() host!: HTMLElement;

  /** Container width below which the items stack, a step of the size scale. */
  @Prop({ reflect: true }) threshold: SizeStep = "l";

  /** Most items allowed in a row, 2 to 6. With more items than that, they stack at any width. Hidden items, templates and scripts do not count; the count is taken again when items are added, removed, hidden or shown. */
  @Prop({ reflect: true }) limit?: number;

  /** Space between items, in both directions, a step of the space scale. Without it the layout's gap is used. */
  @Prop({ reflect: true }) gap?: GapStep;

  @State() private itemCount = 0;

  private stopWatching?: () => void;

  connectedCallback(): void {
    this.stopWatching = watchItems(this.host, () => {
      this.countItems();
    });
  }

  disconnectedCallback(): void {
    this.stopWatching?.();
  }

  componentWillLoad(): void {
    this.countItems();
  }

  componentDidLoad(): void {
    // The slot exists now, so items forwarded to it by another component are counted too.
    this.countItems();
  }

  // Only a count is read, never a size. CSS cannot count the host's children from inside the
  // shadow tree (:host() takes no :has()), and the limit needs the total to stack every item.
  // Items that are hidden or draw nothing are not counted.
  private countItems(): void {
    const count = itemsInSlot(this.host, null).length;
    if (count !== this.itemCount) this.itemCount = count;
  }

  render() {
    const threshold = stepOf(SIZE_STEPS, this.threshold) ?? "l";
    const limit = limitOf(this.limit);
    const gap = stepOf(GAP_STEPS, this.gap);
    return (
      <div
        class={{
          switcher: true,
          [`size-${threshold}`]: true,
          "over-limit": limit !== undefined && this.itemCount > limit,
          [`gap-${String(gap)}`]: gap !== undefined,
        }}
        part="switcher"
      >
        <slot
          onSlotchange={() => {
            this.countItems();
          }}
        />
      </div>
    );
  }
}
