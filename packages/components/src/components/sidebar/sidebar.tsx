import { Component, Element, h, Prop, State } from "@stencil/core";
import { itemsInSlot, watchItems } from "../../utils/slot-items";
import { oneOf } from "../../utils/choice";
import {
  GAP_STEPS,
  SIZE_STEPS,
  stepOf,
  type GapStep,
  type SizeStep,
} from "../../utils/layout-steps";
import { SIDEBAR_SIDES, type SidebarSide } from "./sidebar-options";

/**
 * Two regions side by side: a side region of a set width and the content, which takes the rest.
 * When the content would get less than half of the width, the regions stack instead, with no
 * breakpoint and no script, so it follows the width of its container rather than the viewport.
 *
 * The side region is drawn first when it is at the start and last when it is at the end, so what a
 * reader and the Tab key meet first is also what is shown first, in either text direction. When
 * the regions stack, the side region is above the content when it is at the start and below it
 * when it is at the end.
 *
 * @slot side - The side region.
 * @slot - The content.
 * @part sidebar - The element that lays the regions out.
 * @part side - The wrapper around the side slot.
 * @part content - The wrapper around the default slot.
 */
@Component({
  tag: "idg-sidebar",
  styleUrls: ["sidebar.css", "../../styles/layout-gap.css", "../../styles/layout-size.css"],
  shadow: true,
})
export class IdgSidebar {
  @Element() host!: HTMLElement;

  /** Which side of the content the side region is on, in the reading direction. */
  @Prop({ reflect: true }) side: SidebarSide = "start";

  /** Width of the side region, a step of the size scale. Without it the layout's aside width is used. */
  @Prop({ reflect: true, attribute: "side-width" }) sideWidth?: SizeStep;

  /** Space between the regions, a step of the space scale. Without it the layout's gap is used. */
  @Prop({ reflect: true }) gap?: GapStep;

  @State() private hasSide = false;

  private stopWatching?: () => void;

  private loaded = false;

  connectedCallback(): void {
    // Items may have changed while it was detached, and nothing was watching.
    if (this.loaded) this.readSide();
    this.stopWatching = watchItems(this.host, () => {
      this.readSide();
    });
  }

  disconnectedCallback(): void {
    this.stopWatching?.();
  }

  componentWillLoad(): void {
    this.readSide();
  }

  componentDidLoad(): void {
    this.loaded = true;
    this.readSide();
  }

  // The side region keeps its width and its gap while nothing in it is drawn, unless it is told.
  private readSide(): void {
    const next = itemsInSlot(this.host, "side").length > 0;
    if (next !== this.hasSide) this.hasSide = next;
  }

  render() {
    const side = oneOf(SIDEBAR_SIDES, this.side, "start");
    const width = stepOf(SIZE_STEPS, this.sideWidth);
    const gap = stepOf(GAP_STEPS, this.gap);
    const aside = (
      <div class={{ side: true, empty: !this.hasSide }} part="side">
        <slot
          name="side"
          onSlotchange={() => {
            this.readSide();
          }}
        />
      </div>
    );
    const content = (
      <div class="content" part="content">
        <slot />
      </div>
    );
    return (
      <div
        class={{
          sidebar: true,
          [`size-${String(width)}`]: width !== undefined,
          [`gap-${String(gap)}`]: gap !== undefined,
        }}
        part="sidebar"
      >
        {side === "start" ? [aside, content] : [content, aside]}
      </div>
    );
  }
}
