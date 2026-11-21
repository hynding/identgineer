import { Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { GAP_STEPS, stepOf, type GapStep } from "../../utils/layout-steps";
import {
  CLUSTER_ALIGNMENTS,
  CLUSTER_JUSTIFICATIONS,
  type ClusterAlignment,
  type ClusterJustification,
} from "./cluster-options";

/**
 * A group of items in a row that wraps onto further rows when it runs out of room, such as tags,
 * buttons or a toolbar. It only arranges, so it adds no role and the source order stays the
 * reading order.
 *
 * @slot - The items, in reading order.
 * @part cluster - The element that lays the items out.
 */
@Component({
  tag: "idg-cluster",
  styleUrls: ["cluster.css", "../../styles/layout-gap.css"],
  shadow: true,
})
export class IdgCluster {
  /** Space between items, in both directions, a step of the space scale. Without it the layout's gap is used. */
  @Prop({ reflect: true }) gap?: GapStep;

  /** How each row is spread along the inline axis. `between` pushes the first and last items apart. */
  @Prop({ reflect: true }) justify: ClusterJustification = "start";

  /** How items in a row line up on the block axis. */
  @Prop({ reflect: true }) align: ClusterAlignment = "center";

  render() {
    const gap = stepOf(GAP_STEPS, this.gap);
    const justify = oneOf(CLUSTER_JUSTIFICATIONS, this.justify, "start");
    const align = oneOf(CLUSTER_ALIGNMENTS, this.align, "center");
    return (
      <div
        class={{
          cluster: true,
          [`justify-${justify}`]: true,
          [`align-${align}`]: true,
          [`gap-${String(gap)}`]: gap !== undefined,
        }}
        part="cluster"
      >
        <slot />
      </div>
    );
  }
}
