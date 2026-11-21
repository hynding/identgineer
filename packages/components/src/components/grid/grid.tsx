import { Component, h, Prop } from "@stencil/core";
import {
  GAP_STEPS,
  SIZE_STEPS,
  stepOf,
  type GapStep,
  type SizeStep,
} from "../../utils/layout-steps";

/**
 * Items in as many equal columns as fit. Each column is at least `min` wide, and there are never
 * more columns than the layout allows, so the same markup has more or fewer columns under each
 * `data-layout`. It only arranges, so it adds no role and the source order stays the reading order.
 *
 * @slot - The items, in reading order.
 * @part grid - The element that lays the items out.
 */
@Component({
  tag: "idg-grid",
  styleUrls: ["grid.css", "../../styles/layout-gap.css", "../../styles/layout-size.css"],
  shadow: true,
})
export class IdgGrid {
  /** Narrowest a column may be, a step of the size scale. Without it the layout's track size is used. */
  @Prop({ reflect: true }) min?: SizeStep;

  /** Space between items, in both directions, a step of the space scale. Without it the layout's gap is used. */
  @Prop({ reflect: true }) gap?: GapStep;

  render() {
    const min = stepOf(SIZE_STEPS, this.min);
    const gap = stepOf(GAP_STEPS, this.gap);
    return (
      <div
        class={{
          grid: true,
          [`size-${String(min)}`]: min !== undefined,
          [`gap-${String(gap)}`]: gap !== undefined,
        }}
        part="grid"
      >
        <slot />
      </div>
    );
  }
}
