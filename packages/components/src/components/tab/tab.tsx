import { Component, h, Prop } from "@stencil/core";
import type { TabsOrientation } from "../tabs/tabs-options";

/**
 * One tab of an idg-tabs, which owns the keyboard, the selection and the link to its panel. The
 * host carries the tab role and state itself, so the relations to the panel, which sits beside it
 * in the page, can be made between the two hosts.
 *
 * @slot - The tab's label.
 * @part tab - The drawn tab.
 */
@Component({
  tag: "idg-tab",
  shadow: true,
})
export class IdgTab {
  /** Pairs the tab with the panel of the same value. */
  @Prop({ reflect: true }) value = "";

  /** Keeps the tab in the list, where it is announced, but stops it being selected. */
  @Prop({ reflect: true }) disabled = false;

  /** Set by the tabs: whether this tab is selected. */
  @Prop({ reflect: true }) selected = false;

  /** Set by the tabs: whether this tab is the one tab stop of the list. */
  @Prop() tabbable = false;

  /** Set by the tabs: which way the list runs. */
  @Prop() orientation: TabsOrientation = "horizontal";

  render() {
    return <div />;
  }
}
